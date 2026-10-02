import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// M2 (D50): the rules for members' Glia Notes state that the database itself enforces. The site
// writes these columns in SQL (src/lib/members/store.ts), which skips Payload's hooks and field
// checks, so whatever must never be stored is refused here, whoever writes:
// - the listmonk subscriber that holds a member's Glia Notes is named by its ID (a positive `int4`)
//   and its UUID (in its stored form, lower case), both or neither;
// - the consent text's version a member agreed to is a date or a short code, never free text (the
//   sync copies it into the consent log, which refuses anything else too);
// - where and when the consent behind "on" was asked for (`digest_consent_source` and
//   `digest_requested_at`) are set exactly while Glia Notes is on, together, and the request is
//   never later than the choice it led to (rows that are on already get the account's settings at
//   the time of the choice, as the only way to turn it on before this migration).
//
// Plain SQL, like 20261001_142246_member_constraints: Payload does not know CHECK constraints, and
// `pnpm migrate:create` compares the collections with the last .json snapshot, never with the
// database, so later generated migrations neither see nor drop them. The names end in `_check`.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE members
      SET digest_consent_source = 'account',
        digest_requested_at = COALESCE(digest_changed_at, updated_at)
      WHERE digest_opt_in AND digest_consent_source IS NULL;
    UPDATE members SET digest_changed_at = digest_requested_at
      WHERE digest_opt_in AND digest_changed_at IS NULL;
    ALTER TABLE members
      ADD CONSTRAINT members_digest_subscriber_check
        CHECK ((digest_subscriber_id IS NULL) = (digest_subscriber_uuid IS NULL)),
      ADD CONSTRAINT members_digest_subscriber_id_check
        CHECK (digest_subscriber_id = trunc(digest_subscriber_id)
          AND digest_subscriber_id BETWEEN 1 AND 2147483647),
      ADD CONSTRAINT members_digest_subscriber_uuid_check
        CHECK (digest_subscriber_uuid
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
      ADD CONSTRAINT members_digest_consent_version_check
        CHECK (digest_consent_version ~ '^[0-9A-Za-z._-]{1,40}$'),
      ADD CONSTRAINT members_digest_consent_source_check
        CHECK ((digest_consent_source IS NOT NULL) = (digest_opt_in IS TRUE)
          AND (digest_consent_source IS NULL) = (digest_requested_at IS NULL)),
      ADD CONSTRAINT members_digest_requested_at_check
        CHECK (digest_requested_at <= digest_changed_at);
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE members
      DROP CONSTRAINT IF EXISTS members_digest_requested_at_check,
      DROP CONSTRAINT IF EXISTS members_digest_consent_source_check,
      DROP CONSTRAINT IF EXISTS members_digest_consent_version_check,
      DROP CONSTRAINT IF EXISTS members_digest_subscriber_uuid_check,
      DROP CONSTRAINT IF EXISTS members_digest_subscriber_id_check,
      DROP CONSTRAINT IF EXISTS members_digest_subscriber_check;
  `)
}
