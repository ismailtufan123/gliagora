import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE IF NOT EXISTS 'syncGliaNotesIssues' BEFORE 'monitorSources';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE IF NOT EXISTS 'syncGliaNotesIssues' BEFORE 'monitorSources';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'rorImport', 'expireListings', 'purgeFormLimits', 'syncJobPlaces', 'purgeRetention', 'notifySubmitters', 'acknowledgeReports', 'applyDeletionLog', 'purgeMemberAuth', 'cleanInactiveMembers', 'sendRequestEmails', 'syncGliaNotes', 'checkGliaNotesMembers', 'monitorSources', 'checkLinks', 'draftWithClaude');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'rorImport', 'expireListings', 'purgeFormLimits', 'syncJobPlaces', 'purgeRetention', 'notifySubmitters', 'acknowledgeReports', 'applyDeletionLog', 'purgeMemberAuth', 'cleanInactiveMembers', 'sendRequestEmails', 'syncGliaNotes', 'checkGliaNotesMembers', 'monitorSources', 'checkLinks', 'draftWithClaude');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
