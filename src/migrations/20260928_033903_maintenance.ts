import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_retired_listings_kind" AS ENUM('job');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'expireListings';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'purgeFormLimits';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'syncJobPlaces';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'purgeRetention';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'notifySubmitters';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'acknowledgeReports';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'expireListings';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'purgeFormLimits';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'syncJobPlaces';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'purgeRetention';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'notifySubmitters';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'acknowledgeReports';
  CREATE TABLE "retired_listings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_retired_listings_kind" DEFAULT 'job' NOT NULL,
  	"short_id" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"retired_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "retired_listings_id" integer;
  CREATE UNIQUE INDEX "retired_listings_short_id_idx" ON "retired_listings" USING btree ("short_id");
  CREATE INDEX "retired_listings_retired_at_idx" ON "retired_listings" USING btree ("retired_at");
  CREATE INDEX "retired_listings_updated_at_idx" ON "retired_listings" USING btree ("updated_at");
  CREATE INDEX "retired_listings_created_at_idx" ON "retired_listings" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_retired_listings_fk" FOREIGN KEY ("retired_listings_id") REFERENCES "public"."retired_listings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_retired_listings_id_idx" ON "payload_locked_documents_rels" USING btree ("retired_listings_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The generated statements dropped the table with CASCADE first, which also drops the foreign
  // key from payload_locked_documents_rels, so the next statement failed: the column goes first.
  // Jobs of the removed tasks are deleted, since the old task types cannot hold them.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_retired_listings_fk";
  DROP INDEX "payload_locked_documents_rels_retired_listings_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "retired_listings_id";
  DROP TABLE "retired_listings";
  DELETE FROM "payload_jobs_log" WHERE "task_slug"::text NOT IN ('inline', 'rorImport');
  DELETE FROM "payload_jobs" WHERE "task_slug"::text NOT IN ('inline', 'rorImport');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'rorImport');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'rorImport');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_retired_listings_kind";`)
}
