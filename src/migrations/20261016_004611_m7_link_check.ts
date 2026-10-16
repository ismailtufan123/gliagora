import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'checkLinks';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'checkLinks';
  ALTER TABLE "jobs" ADD COLUMN "link_says_closed" boolean DEFAULT false;
  ALTER TABLE "jobs" ADD COLUMN "link_note" varchar;
  ALTER TABLE "jobs" ADD COLUMN "link_warning_dismissed" boolean DEFAULT false;
  ALTER TABLE "_jobs_v" ADD COLUMN "version_link_says_closed" boolean DEFAULT false;
  ALTER TABLE "_jobs_v" ADD COLUMN "version_link_note" varchar;
  ALTER TABLE "_jobs_v" ADD COLUMN "version_link_warning_dismissed" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'rorImport', 'expireListings', 'purgeFormLimits', 'syncJobPlaces', 'purgeRetention', 'notifySubmitters', 'acknowledgeReports', 'applyDeletionLog', 'purgeMemberAuth', 'cleanInactiveMembers', 'sendRequestEmails', 'syncGliaNotes', 'checkGliaNotesMembers', 'monitorSources');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'rorImport', 'expireListings', 'purgeFormLimits', 'syncJobPlaces', 'purgeRetention', 'notifySubmitters', 'acknowledgeReports', 'applyDeletionLog', 'purgeMemberAuth', 'cleanInactiveMembers', 'sendRequestEmails', 'syncGliaNotes', 'checkGliaNotesMembers', 'monitorSources');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "jobs" DROP COLUMN "link_says_closed";
  ALTER TABLE "jobs" DROP COLUMN "link_note";
  ALTER TABLE "jobs" DROP COLUMN "link_warning_dismissed";
  ALTER TABLE "_jobs_v" DROP COLUMN "version_link_says_closed";
  ALTER TABLE "_jobs_v" DROP COLUMN "version_link_note";
  ALTER TABLE "_jobs_v" DROP COLUMN "version_link_warning_dismissed";`)
}
