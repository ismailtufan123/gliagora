import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// M4.7 review fixes. `from_suggestion` marks a candidate made from a suggestion, and stays when the
// suggestion is deleted by hand (a data request), so the retention task still clears the suggested
// link 90 days after the decision (src/jobs/maintenance/purgeRetention.ts). Existing candidates are
// marked from their suggestion link.
//
// The two triggers keep a recorded send: the email tasks set `ack_sent_at` and `notified_at` with
// raw SQL once the mail server accepted a message, while a Payload save writes the whole row as it
// read it a moment earlier, which would put back NULL and send the email again. Nothing ever clears
// these columns (the retention task deletes the whole row). Payload does not know triggers, so
// `pnpm migrate:create` leaves them alone; the `down` here removes them.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "candidates" ADD COLUMN "from_suggestion" boolean DEFAULT false;
  ALTER TABLE "_candidates_v" ADD COLUMN "version_from_suggestion" boolean DEFAULT false;
  UPDATE "candidates" SET "from_suggestion" = true WHERE "submission_id" IS NOT NULL;
  UPDATE "_candidates_v" SET "version_from_suggestion" = true
    WHERE "parent_id" IN (SELECT "id" FROM "candidates" WHERE "from_suggestion");
  CREATE FUNCTION "reports_keep_ack_sent_at"() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    NEW.ack_sent_at := COALESCE(NEW.ack_sent_at, OLD.ack_sent_at);
    RETURN NEW;
  END $$;
  CREATE TRIGGER "reports_keep_ack_sent_at" BEFORE UPDATE ON "reports"
    FOR EACH ROW EXECUTE FUNCTION "reports_keep_ack_sent_at"();
  CREATE FUNCTION "submissions_keep_notified_at"() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    NEW.notified_at := COALESCE(NEW.notified_at, OLD.notified_at);
    RETURN NEW;
  END $$;
  CREATE TRIGGER "submissions_keep_notified_at" BEFORE UPDATE ON "submissions"
    FOR EACH ROW EXECUTE FUNCTION "submissions_keep_notified_at"();`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TRIGGER IF EXISTS "submissions_keep_notified_at" ON "submissions";
  DROP FUNCTION IF EXISTS "submissions_keep_notified_at"();
  DROP TRIGGER IF EXISTS "reports_keep_ack_sent_at" ON "reports";
  DROP FUNCTION IF EXISTS "reports_keep_ack_sent_at"();
  ALTER TABLE "candidates" DROP COLUMN "from_suggestion";
  ALTER TABLE "_candidates_v" DROP COLUMN "version_from_suggestion";`)
}
