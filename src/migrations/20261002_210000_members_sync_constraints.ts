import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// M2 (D50): the rules for members' Glia Notes state that the database itself enforces. The site
// writes these columns in SQL (src/lib/members/store.ts), which skips Payload's hooks and field
// checks, so whatever must never be stored is refused here, whoever writes:
// - the listmonk subscriber that holds a member's Glia Notes is named by its ID (a positive `int4`)
//   and its UUID (in its stored form, lower case), both or neither;
// - the consent text's version a member agreed to is a date or a short code, never free text (the
//   sync copies it into the consent log, which refuses anything else too).
//
// Plain SQL, like 20261001_142246_member_constraints: Payload does not know CHECK constraints, and
// `pnpm migrate:create` compares the collections with the last .json snapshot, never with the
// database, so later generated migrations neither see nor drop them. The names end in `_check`.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
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
        CHECK (digest_consent_version ~ '^[0-9A-Za-z._-]{1,40}$');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE members
      DROP CONSTRAINT IF EXISTS members_digest_consent_version_check,
      DROP CONSTRAINT IF EXISTS members_digest_subscriber_uuid_check,
      DROP CONSTRAINT IF EXISTS members_digest_subscriber_id_check,
      DROP CONSTRAINT IF EXISTS members_digest_subscriber_check;
  `)
}
