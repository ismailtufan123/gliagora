import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// M2 (D50): the rules for Glia Notes' rows that the database itself enforces. The site writes
// these rows in SQL (src/lib/newsletter/store.ts, src/lib/members/store.ts), which skips Payload's
// hooks and field checks, so whatever must never be stored is refused here, whoever writes:
// - a consent record names a subscriber by listmonk's UUID in its stored form (lower case) and its
//   ID (a positive `int4`), both or neither (once unlinked), says which version of the consent text
//   was agreed to when it records a request or a confirmation (a version is a date or a short code,
//   never free text, so no address fits), and comes from a source that fits its event: a request
//   or a confirmation from the form or a member's settings, an unsubscribe from the settings, the
//   unsubscribe page, a mail program's one-click or listmonk (the site noted that listmonk no
//   longer has the subscriber);
// - a pending signup's link (`newsletter`) holds exactly what its consent record needs
//   (`request_data` with the version, in the consent records' format, the form and the time the
//   form was sent, as an ISO timestamp, and no other key) and nothing that binds it to a member, a
//   browser or a request, or says where to go next or what to save.
//
// A CHECK passes when its expression is NULL, so what reads a JSON field that may be missing is
// wrapped in `coalesce(…, false)`. The checks compare the enums as text: PostgreSQL refuses to use
// an enum value in the transaction that added it (20261002_161547_newsletter adds 'newsletter'),
// and a migration run as one statement (the database tests) would be one transaction.
//
// Plain SQL, like 20261001_142246_member_constraints: Payload does not know CHECK constraints, and
// `pnpm migrate:create` compares the collections with the last .json snapshot, never with the
// database, so later generated migrations neither see nor drop them. The names end in `_check`.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE consent_log
      ADD CONSTRAINT consent_log_uuid_format_check
        CHECK (subscriber_uuid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
      ADD CONSTRAINT consent_log_subscriber_id_check
        CHECK (subscriber_id = trunc(subscriber_id) AND subscriber_id BETWEEN 1 AND 2147483647),
      ADD CONSTRAINT consent_log_subscriber_check
        CHECK ((subscriber_uuid IS NULL) = (subscriber_id IS NULL)),
      ADD CONSTRAINT consent_log_version_format_check
        CHECK (consent_version ~ '^[0-9A-Za-z._-]{1,40}$'),
      ADD CONSTRAINT consent_log_version_check
        CHECK (event::text = 'unsubscribed' OR consent_version IS NOT NULL),
      ADD CONSTRAINT consent_log_source_check
        CHECK (
          (event::text IN ('requested', 'confirmed') AND source::text IN ('newsletter-form', 'account'))
          OR (event::text = 'unsubscribed'
            AND source::text IN ('account', 'unsubscribe-link', 'one-click', 'listmonk')));

    ALTER TABLE email_tokens
      ADD CONSTRAINT email_tokens_newsletter_check
        CHECK (purpose::text <> 'newsletter' OR (
          CASE WHEN jsonb_typeof(request_data) = 'object' THEN coalesce(
            jsonb_typeof(request_data -> 'version') = 'string'
            AND request_data ->> 'version' ~ '^[0-9A-Za-z._-]{1,40}$'
            AND request_data ->> 'source' = 'newsletter-form'
            AND jsonb_typeof(request_data -> 'requestedAt') = 'string'
            AND request_data ->> 'requestedAt'
              ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,9})?Z$'
            AND (request_data - 'version' - 'source' - 'requestedAt') = '{}'::jsonb, false)
          ELSE false END
          AND member_id IS NULL AND browser_hash IS NULL AND request_id IS NULL
          AND next IS NULL AND save IS NULL));
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE email_tokens DROP CONSTRAINT IF EXISTS email_tokens_newsletter_check;
    ALTER TABLE consent_log
      DROP CONSTRAINT IF EXISTS consent_log_source_check,
      DROP CONSTRAINT IF EXISTS consent_log_version_check,
      DROP CONSTRAINT IF EXISTS consent_log_version_format_check,
      DROP CONSTRAINT IF EXISTS consent_log_subscriber_check,
      DROP CONSTRAINT IF EXISTS consent_log_subscriber_id_check,
      DROP CONSTRAINT IF EXISTS consent_log_uuid_format_check;
  `)
}
