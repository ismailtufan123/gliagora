import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_institutions_types" AS ENUM('education', 'healthcare', 'company', 'archive', 'nonprofit', 'government', 'facility', 'funder', 'other');
  CREATE TYPE "public"."enum_institutions_origin" AS ENUM('ror', 'manual');
  CREATE TYPE "public"."enum_institutions_status" AS ENUM('active', 'inactive', 'withdrawn');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'rorImport');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'rorImport');
  CREATE TABLE "institutions_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_institutions_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "institutions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"ror_id" varchar,
  	"origin" "enum_institutions_origin" DEFAULT 'manual' NOT NULL,
  	"status" "enum_institutions_status" DEFAULT 'active' NOT NULL,
  	"slug" varchar NOT NULL,
  	"short_id" varchar,
  	"country_id" varchar,
  	"city" varchar,
  	"lat" numeric,
  	"lng" numeric,
  	"website" varchar,
  	"ror_release" varchar,
  	"ror_last_modified" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "institutions_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"meta" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "ror_import" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"release" varchar,
  	"release_date" varchar,
  	"last_imported_at" timestamp(3) with time zone,
  	"last_checked_at" timestamp(3) with time zone,
  	"counts_read" numeric,
  	"counts_created" numeric,
  	"counts_updated" numeric,
  	"counts_unchanged" numeric,
  	"counts_skipped" numeric,
  	"counts_invalid" numeric,
  	"counts_failed" numeric,
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "institutions_id" integer;
  ALTER TABLE "institutions_types" ADD CONSTRAINT "institutions_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "institutions" ADD CONSTRAINT "institutions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "institutions_texts" ADD CONSTRAINT "institutions_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "institutions_types_order_idx" ON "institutions_types" USING btree ("order");
  CREATE INDEX "institutions_types_parent_idx" ON "institutions_types" USING btree ("parent_id");
  CREATE INDEX "institutions_name_idx" ON "institutions" USING btree ("name");
  CREATE UNIQUE INDEX "institutions_ror_id_idx" ON "institutions" USING btree ("ror_id");
  CREATE INDEX "institutions_slug_idx" ON "institutions" USING btree ("slug");
  CREATE UNIQUE INDEX "institutions_short_id_idx" ON "institutions" USING btree ("short_id");
  CREATE INDEX "institutions_country_idx" ON "institutions" USING btree ("country_id");
  CREATE INDEX "institutions_updated_at_idx" ON "institutions" USING btree ("updated_at");
  CREATE INDEX "institutions_created_at_idx" ON "institutions" USING btree ("created_at");
  CREATE INDEX "institutions_texts_order_parent" ON "institutions_texts" USING btree ("order","parent_id");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_institutions_fk" FOREIGN KEY ("institutions_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_institutions_id_idx" ON "payload_locked_documents_rels" USING btree ("institutions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "institutions_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "institutions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "institutions_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "ror_import" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "institutions_types" CASCADE;
  DROP TABLE "institutions" CASCADE;
  DROP TABLE "institutions_texts" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "ror_import" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_institutions_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_institutions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "institutions_id";
  DROP TYPE "public"."enum_institutions_types";
  DROP TYPE "public"."enum_institutions_origin";
  DROP TYPE "public"."enum_institutions_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
