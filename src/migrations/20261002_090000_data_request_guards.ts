import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// M4b (D49; the M4b design §6, §7.8): two more rules for data requests that the database itself
// enforces, whoever writes.
//
// - A request nobody confirmed holds only its kind, its date and the keyed address hash, as the
//   form, the confirmation email and the privacy texts promise: `data_requests_unconfirmed_minimal_
//   check` (20261001_142246) now also refuses an editor's note, an action and an outcome on it. The
//   admin shows the note and the action read-only while a request is unconfirmed, and the
//   collection refuses them from code that bypasses access control (src/collections/
//   DataRequests.ts); this is the last guard. Rows that already have one lose it first.
// - A confirmed request never goes back to unconfirmed, and keeps what the confirmation stored (the
//   address, the name, the details and the outcome). An editor's save writes the whole row as
//   Payload read it a moment earlier, without a lock (as for `confirmation_sent_at`,
//   20261001_201739): a save of a request read while unconfirmed that waits on the confirmation's
//   lock would otherwise put the row back to unconfirmed, without the address or the outcome, after
//   the person confirmed it. The trigger refuses that save (the editor reloads the request) and
//   keeps the stored columns against any write that empties them. Nothing legitimate does either:
//   the status rules forbid the way back (src/lib/data-requests/status.ts), the retention task
//   deletes whole rows, and a restore's carried rows (deploy/backup/restore.sh) are newer than the
//   rows they replace. The error names only the request's ID.
//
// Plain SQL, like 20261001_142246: Payload knows neither CHECK constraints nor triggers, and
// `pnpm migrate:create` compares the collections with the last .json snapshot, never with the
// database, so later generated migrations leave both alone; the `down` here restores the old check
// and removes the trigger.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE data_requests SET action_note = NULL, action = NULL, outcome = NULL
      WHERE status = 'unconfirmed'
        AND (action_note IS NOT NULL OR action IS NOT NULL OR outcome IS NOT NULL);

    ALTER TABLE data_requests
      DROP CONSTRAINT IF EXISTS data_requests_unconfirmed_minimal_check,
      ADD CONSTRAINT data_requests_unconfirmed_minimal_check
        CHECK (status <> 'unconfirmed' OR (email IS NULL AND name IS NULL AND details IS NULL
          AND action_note IS NULL AND action IS NULL AND outcome IS NULL));

    CREATE FUNCTION "data_requests_stay_confirmed"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.status <> 'unconfirmed' AND NEW.status = 'unconfirmed' THEN
        RAISE EXCEPTION 'data request % was confirmed meanwhile; reload it', OLD.id
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.email := COALESCE(NEW.email, OLD.email);
      NEW.name := COALESCE(NEW.name, OLD.name);
      NEW.details := COALESCE(NEW.details, OLD.details);
      NEW.outcome := COALESCE(NEW.outcome, OLD.outcome);
      RETURN NEW;
    END $$;
    CREATE TRIGGER "data_requests_stay_confirmed" BEFORE UPDATE ON "data_requests"
      FOR EACH ROW EXECUTE FUNCTION "data_requests_stay_confirmed"();
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS "data_requests_stay_confirmed" ON "data_requests";
    DROP FUNCTION IF EXISTS "data_requests_stay_confirmed"();
    ALTER TABLE data_requests
      DROP CONSTRAINT IF EXISTS data_requests_unconfirmed_minimal_check,
      ADD CONSTRAINT data_requests_unconfirmed_minimal_check
        CHECK (status <> 'unconfirmed' OR (email IS NULL AND name IS NULL AND details IS NULL));
  `)
}
