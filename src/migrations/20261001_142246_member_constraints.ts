import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// M4b (D49; the M4b design §6): the rules for member and data-request rows that the database itself
// enforces. The site writes these rows in SQL (src/lib/members/store.ts), which skips Payload's
// hooks and field checks, so whatever must never be stored is refused here, whoever writes:
// - a member always has a way in (an address, a Google account or an ORCID iD), so an unlink can
//   never leave an account nobody can reach; its address is stored lowercased, so lookups never
//   depend on how it was typed; an ORCID iD has ORCID's format (the check character in code);
// - sessions and email links hold the SHA-256 of their token, never the token itself, and a link's
//   address is lowercased;
// - a data request that nobody confirmed holds no address, name or details (only its kind, its
//   date and the keyed address hash), and a request keeps the address it is answered at, except a
//   deletion of an account that had none.
//
// Plain SQL, like the search migration (20260928_100000_search.ts). Payload does not know CHECK
// constraints, and `pnpm migrate:create` compares the collections with the last .json snapshot,
// never with the database, so later generated migrations neither see nor drop them; a migration
// that drops or renames one of these columns must drop the constraint first. The names end in
// `_check`, which Payload's own names (`…_idx`, `…_fk`) never do.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE members
      ADD CONSTRAINT members_has_way_in_check
        CHECK (email IS NOT NULL OR google_id IS NOT NULL OR orcid_id IS NOT NULL),
      ADD CONSTRAINT members_lowercase_email_check CHECK (email = lower(email)),
      ADD CONSTRAINT members_orcid_format_check
        CHECK (orcid_id ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$');

    ALTER TABLE member_sessions
      ADD CONSTRAINT member_sessions_sha256_check CHECK (token_hash ~ '^[0-9a-f]{64}$');

    ALTER TABLE email_tokens
      ADD CONSTRAINT email_tokens_sha256_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      ADD CONSTRAINT email_tokens_binding_sha256_check CHECK (browser_hash ~ '^[0-9a-f]{64}$'),
      ADD CONSTRAINT email_tokens_lowercase_email_check CHECK (email = lower(email));

    ALTER TABLE data_requests
      ADD CONSTRAINT data_requests_unconfirmed_minimal_check
        CHECK (status <> 'unconfirmed' OR (email IS NULL AND name IS NULL AND details IS NULL)),
      ADD CONSTRAINT data_requests_keeps_email_check
        CHECK (email IS NOT NULL OR status = 'unconfirmed' OR (source = 'account' AND kind = 'deletion')),
      ADD CONSTRAINT data_requests_hash_format_check CHECK (email_hash ~ '^[0-9a-f]{64}$');
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE data_requests
      DROP CONSTRAINT IF EXISTS data_requests_hash_format_check,
      DROP CONSTRAINT IF EXISTS data_requests_keeps_email_check,
      DROP CONSTRAINT IF EXISTS data_requests_unconfirmed_minimal_check;
    ALTER TABLE email_tokens
      DROP CONSTRAINT IF EXISTS email_tokens_lowercase_email_check,
      DROP CONSTRAINT IF EXISTS email_tokens_binding_sha256_check,
      DROP CONSTRAINT IF EXISTS email_tokens_sha256_check;
    ALTER TABLE member_sessions DROP CONSTRAINT IF EXISTS member_sessions_sha256_check;
    ALTER TABLE members
      DROP CONSTRAINT IF EXISTS members_orcid_format_check,
      DROP CONSTRAINT IF EXISTS members_lowercase_email_check,
      DROP CONSTRAINT IF EXISTS members_has_way_in_check;
  `)
}
