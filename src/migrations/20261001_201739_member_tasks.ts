import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// M4b (D49; the M4b design §9): the member tasks join the maintenance queue (applyDeletionLog,
// purgeMemberAuth, cleanInactiveMembers, sendRequestEmails), so the job tables' task names gain
// them.
//
// The trigger keeps a recorded send, as for reports and suggestions (20260928_052700): the task
// `sendRequestEmails` sets `confirmation_sent_at` with raw SQL once the mail server accepted the
// final email of a deletion, while an editor's save of the request writes the whole row as it read
// it a moment earlier, which would put back NULL and send the email again. Nothing ever clears the
// column (the retention task deletes the whole row). Payload does not know triggers, so
// `pnpm migrate:create` leaves it alone; the `down` here removes it.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'applyDeletionLog';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'purgeMemberAuth';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'cleanInactiveMembers';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'sendRequestEmails';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'applyDeletionLog';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'purgeMemberAuth';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'cleanInactiveMembers';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'sendRequestEmails';
  CREATE FUNCTION "data_requests_keep_confirmation_sent_at"() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    NEW.confirmation_sent_at := COALESCE(NEW.confirmation_sent_at, OLD.confirmation_sent_at);
    RETURN NEW;
  END $$;
  CREATE TRIGGER "data_requests_keep_confirmation_sent_at" BEFORE UPDATE ON "data_requests"
    FOR EACH ROW EXECUTE FUNCTION "data_requests_keep_confirmation_sent_at"();`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Jobs of the removed tasks are deleted, since the old task types cannot hold them.
  await db.execute(sql`
   DROP TRIGGER IF EXISTS "data_requests_keep_confirmation_sent_at" ON "data_requests";
  DROP FUNCTION IF EXISTS "data_requests_keep_confirmation_sent_at"();
  DELETE FROM "payload_jobs_log" WHERE "task_slug"::text IN ('applyDeletionLog', 'purgeMemberAuth', 'cleanInactiveMembers', 'sendRequestEmails');
  DELETE FROM "payload_jobs" WHERE "task_slug"::text IN ('applyDeletionLog', 'purgeMemberAuth', 'cleanInactiveMembers', 'sendRequestEmails');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'rorImport', 'expireListings', 'purgeFormLimits', 'syncJobPlaces', 'purgeRetention', 'notifySubmitters', 'acknowledgeReports');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'rorImport', 'expireListings', 'purgeFormLimits', 'syncJobPlaces', 'purgeRetention', 'notifySubmitters', 'acknowledgeReports');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
