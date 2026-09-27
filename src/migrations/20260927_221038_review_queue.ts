import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_candidates_status" AS ENUM('new', 'triaged', 'accepted', 'rejected', 'duplicate');
  CREATE TYPE "public"."enum_candidates_decision_reason" AS ENUM('not-neuroscience', 'agency-or-intermediary', 'closed', 'not-a-position', 'not-employer-page', 'spam', 'other');
  CREATE TYPE "public"."enum_candidates_kind" AS ENUM('job');
  CREATE TYPE "public"."enum__candidates_v_version_status" AS ENUM('new', 'triaged', 'accepted', 'rejected', 'duplicate');
  CREATE TYPE "public"."enum__candidates_v_version_decision_reason" AS ENUM('not-neuroscience', 'agency-or-intermediary', 'closed', 'not-a-position', 'not-employer-page', 'spam', 'other');
  CREATE TYPE "public"."enum__candidates_v_version_kind" AS ENUM('job');
  CREATE TYPE "public"."enum_submissions_kind" AS ENUM('position', 'event', 'funding', 'paper', 'news', 'resource', 'other');
  CREATE TYPE "public"."enum_submissions_locale" AS ENUM('en', 'tr');
  CREATE TYPE "public"."enum_submissions_status" AS ENUM('new', 'queued', 'decided');
  CREATE TABLE "candidates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"raw_url" varchar,
  	"raw_title" varchar,
  	"institution_id" integer,
  	"snippet" varchar,
  	"extracted" jsonb,
  	"canonical_url" varchar,
  	"fingerprint" varchar,
  	"status" "enum_candidates_status" DEFAULT 'new' NOT NULL,
  	"decision_reason" "enum_candidates_decision_reason",
  	"duplicate_of_id" integer,
  	"decision_note" varchar,
  	"decided_at" timestamp(3) with time zone,
  	"published_ref_id" integer,
  	"submission_id" integer,
  	"kind" "enum_candidates_kind" DEFAULT 'job' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "candidates_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"jobs_id" integer,
  	"candidates_id" integer
  );
  
  CREATE TABLE "_candidates_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_raw_url" varchar,
  	"version_raw_title" varchar,
  	"version_institution_id" integer,
  	"version_snippet" varchar,
  	"version_extracted" jsonb,
  	"version_canonical_url" varchar,
  	"version_fingerprint" varchar,
  	"version_status" "enum__candidates_v_version_status" DEFAULT 'new' NOT NULL,
  	"version_decision_reason" "enum__candidates_v_version_decision_reason",
  	"version_duplicate_of_id" integer,
  	"version_decision_note" varchar,
  	"version_decided_at" timestamp(3) with time zone,
  	"version_published_ref_id" integer,
  	"version_submission_id" integer,
  	"version_kind" "enum__candidates_v_version_kind" DEFAULT 'job' NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_candidates_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"jobs_id" integer,
  	"candidates_id" integer
  );
  
  CREATE TABLE "submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"kind" "enum_submissions_kind" NOT NULL,
  	"note" varchar,
  	"email" varchar,
  	"consent_to_contact" boolean DEFAULT false,
  	"locale" "enum_submissions_locale" DEFAULT 'en' NOT NULL,
  	"status" "enum_submissions_status" DEFAULT 'new' NOT NULL,
  	"candidate_id" integer,
  	"decided_at" timestamp(3) with time zone,
  	"email_purge_at" timestamp(3) with time zone,
  	"notified_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "jobs" ADD COLUMN "submission_id" integer;
  ALTER TABLE "_jobs_v" ADD COLUMN "version_submission_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "candidates_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "submissions_id" integer;
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_duplicate_of_id_jobs_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_published_ref_id_jobs_id_fk" FOREIGN KEY ("published_ref_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "candidates_rels" ADD CONSTRAINT "candidates_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "candidates_rels" ADD CONSTRAINT "candidates_rels_jobs_fk" FOREIGN KEY ("jobs_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "candidates_rels" ADD CONSTRAINT "candidates_rels_candidates_fk" FOREIGN KEY ("candidates_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_candidates_v" ADD CONSTRAINT "_candidates_v_parent_id_candidates_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_candidates_v" ADD CONSTRAINT "_candidates_v_version_institution_id_institutions_id_fk" FOREIGN KEY ("version_institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_candidates_v" ADD CONSTRAINT "_candidates_v_version_duplicate_of_id_jobs_id_fk" FOREIGN KEY ("version_duplicate_of_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_candidates_v" ADD CONSTRAINT "_candidates_v_version_published_ref_id_jobs_id_fk" FOREIGN KEY ("version_published_ref_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_candidates_v" ADD CONSTRAINT "_candidates_v_version_submission_id_submissions_id_fk" FOREIGN KEY ("version_submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_candidates_v_rels" ADD CONSTRAINT "_candidates_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_candidates_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_candidates_v_rels" ADD CONSTRAINT "_candidates_v_rels_jobs_fk" FOREIGN KEY ("jobs_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_candidates_v_rels" ADD CONSTRAINT "_candidates_v_rels_candidates_fk" FOREIGN KEY ("candidates_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "submissions" ADD CONSTRAINT "submissions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "candidates_institution_idx" ON "candidates" USING btree ("institution_id");
  CREATE INDEX "candidates_canonical_url_idx" ON "candidates" USING btree ("canonical_url");
  CREATE INDEX "candidates_status_idx" ON "candidates" USING btree ("status");
  CREATE INDEX "candidates_duplicate_of_idx" ON "candidates" USING btree ("duplicate_of_id");
  CREATE INDEX "candidates_decided_at_idx" ON "candidates" USING btree ("decided_at");
  CREATE INDEX "candidates_published_ref_idx" ON "candidates" USING btree ("published_ref_id");
  CREATE INDEX "candidates_submission_idx" ON "candidates" USING btree ("submission_id");
  CREATE INDEX "candidates_updated_at_idx" ON "candidates" USING btree ("updated_at");
  CREATE INDEX "candidates_created_at_idx" ON "candidates" USING btree ("created_at");
  CREATE INDEX "candidates_rels_order_idx" ON "candidates_rels" USING btree ("order");
  CREATE INDEX "candidates_rels_parent_idx" ON "candidates_rels" USING btree ("parent_id");
  CREATE INDEX "candidates_rels_path_idx" ON "candidates_rels" USING btree ("path");
  CREATE INDEX "candidates_rels_jobs_id_idx" ON "candidates_rels" USING btree ("jobs_id");
  CREATE INDEX "candidates_rels_candidates_id_idx" ON "candidates_rels" USING btree ("candidates_id");
  CREATE INDEX "_candidates_v_parent_idx" ON "_candidates_v" USING btree ("parent_id");
  CREATE INDEX "_candidates_v_version_version_institution_idx" ON "_candidates_v" USING btree ("version_institution_id");
  CREATE INDEX "_candidates_v_version_version_canonical_url_idx" ON "_candidates_v" USING btree ("version_canonical_url");
  CREATE INDEX "_candidates_v_version_version_status_idx" ON "_candidates_v" USING btree ("version_status");
  CREATE INDEX "_candidates_v_version_version_duplicate_of_idx" ON "_candidates_v" USING btree ("version_duplicate_of_id");
  CREATE INDEX "_candidates_v_version_version_decided_at_idx" ON "_candidates_v" USING btree ("version_decided_at");
  CREATE INDEX "_candidates_v_version_version_published_ref_idx" ON "_candidates_v" USING btree ("version_published_ref_id");
  CREATE INDEX "_candidates_v_version_version_submission_idx" ON "_candidates_v" USING btree ("version_submission_id");
  CREATE INDEX "_candidates_v_version_version_updated_at_idx" ON "_candidates_v" USING btree ("version_updated_at");
  CREATE INDEX "_candidates_v_version_version_created_at_idx" ON "_candidates_v" USING btree ("version_created_at");
  CREATE INDEX "_candidates_v_created_at_idx" ON "_candidates_v" USING btree ("created_at");
  CREATE INDEX "_candidates_v_updated_at_idx" ON "_candidates_v" USING btree ("updated_at");
  CREATE INDEX "_candidates_v_rels_order_idx" ON "_candidates_v_rels" USING btree ("order");
  CREATE INDEX "_candidates_v_rels_parent_idx" ON "_candidates_v_rels" USING btree ("parent_id");
  CREATE INDEX "_candidates_v_rels_path_idx" ON "_candidates_v_rels" USING btree ("path");
  CREATE INDEX "_candidates_v_rels_jobs_id_idx" ON "_candidates_v_rels" USING btree ("jobs_id");
  CREATE INDEX "_candidates_v_rels_candidates_id_idx" ON "_candidates_v_rels" USING btree ("candidates_id");
  CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");
  CREATE INDEX "submissions_candidate_idx" ON "submissions" USING btree ("candidate_id");
  CREATE INDEX "submissions_decided_at_idx" ON "submissions" USING btree ("decided_at");
  CREATE INDEX "submissions_email_purge_at_idx" ON "submissions" USING btree ("email_purge_at");
  CREATE INDEX "submissions_notified_at_idx" ON "submissions" USING btree ("notified_at");
  CREATE INDEX "submissions_updated_at_idx" ON "submissions" USING btree ("updated_at");
  CREATE INDEX "submissions_created_at_idx" ON "submissions" USING btree ("created_at");
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_jobs_v" ADD CONSTRAINT "_jobs_v_version_submission_id_submissions_id_fk" FOREIGN KEY ("version_submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_candidates_fk" FOREIGN KEY ("candidates_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_submissions_fk" FOREIGN KEY ("submissions_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "jobs_submission_idx" ON "jobs" USING btree ("submission_id");
  CREATE INDEX "_jobs_v_version_version_submission_idx" ON "_jobs_v" USING btree ("version_submission_id");
  CREATE INDEX "payload_locked_documents_rels_candidates_id_idx" ON "payload_locked_documents_rels" USING btree ("candidates_id");
  CREATE INDEX "payload_locked_documents_rels_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("submissions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "candidates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "candidates_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_candidates_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_candidates_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "submissions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "candidates" CASCADE;
  DROP TABLE "candidates_rels" CASCADE;
  DROP TABLE "_candidates_v" CASCADE;
  DROP TABLE "_candidates_v_rels" CASCADE;
  DROP TABLE "submissions" CASCADE;
  ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_submission_id_submissions_id_fk";
  
  ALTER TABLE "_jobs_v" DROP CONSTRAINT IF EXISTS "_jobs_v_version_submission_id_submissions_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_candidates_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_submissions_fk";
  
  DROP INDEX IF EXISTS "jobs_submission_idx";
  DROP INDEX IF EXISTS "_jobs_v_version_version_submission_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_candidates_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_submissions_id_idx";
  ALTER TABLE "jobs" DROP COLUMN "submission_id";
  ALTER TABLE "_jobs_v" DROP COLUMN "version_submission_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "candidates_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "submissions_id";
  DROP TYPE "public"."enum_candidates_status";
  DROP TYPE "public"."enum_candidates_decision_reason";
  DROP TYPE "public"."enum_candidates_kind";
  DROP TYPE "public"."enum__candidates_v_version_status";
  DROP TYPE "public"."enum__candidates_v_version_decision_reason";
  DROP TYPE "public"."enum__candidates_v_version_kind";
  DROP TYPE "public"."enum_submissions_kind";
  DROP TYPE "public"."enum_submissions_locale";
  DROP TYPE "public"."enum_submissions_status";`)
}
