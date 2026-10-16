import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sources_kind" AS ENUM('rss', 'api', 'page', 'manual');
  CREATE TYPE "public"."enum_sources_api_format" AS ENUM('greenhouse', 'lever', 'smartrecruiters');
  CREATE TYPE "public"."enum_sources_schedule" AS ENUM('daily', 'weekly', 'monthly');
  CREATE TYPE "public"."enum_sources_terms_automation" AS ENUM('not-stated', 'allows', 'forbids', 'not-found');
  CREATE TYPE "public"."enum_source_postings_outcome" AS ENUM('candidate', 'not-neuroscience', 'closed', 'duplicate');
  CREATE TABLE "sources_more_urls" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar
  );
  
  CREATE TABLE "sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"institution_id" integer,
  	"kind" "enum_sources_kind" DEFAULT 'manual' NOT NULL,
  	"api_format" "enum_sources_api_format",
  	"schedule" "enum_sources_schedule" DEFAULT 'daily' NOT NULL,
  	"url" varchar NOT NULL,
  	"posting_pattern" varchar,
  	"all_neuroscience" boolean DEFAULT false,
  	"active" boolean DEFAULT true,
  	"terms_url" varchar,
  	"terms_automation" "enum_sources_terms_automation" DEFAULT 'not-stated' NOT NULL,
  	"terms_checked_at" timestamp(3) with time zone,
  	"terms_note" varchar,
  	"robots_allowed" boolean,
  	"robots_checked_at" timestamp(3) with time zone,
  	"robots_note" varchar,
  	"terms_changed_at" timestamp(3) with time zone,
  	"terms_hash" varchar,
  	"terms_reviewed_hash" varchar,
  	"terms_fetched_at" timestamp(3) with time zone,
  	"notes" varchar,
  	"looked_today" boolean DEFAULT false,
  	"looked_at" timestamp(3) with time zone,
  	"needs_attention" boolean DEFAULT false,
  	"attention_reason" varchar,
  	"last_run_at" timestamp(3) with time zone,
  	"last_success_at" timestamp(3) with time zone,
  	"consecutive_failures" numeric DEFAULT 0,
  	"last_error" varchar,
  	"last_run_found" numeric DEFAULT 0,
  	"candidates_found" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "source_postings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source_id" integer NOT NULL,
  	"canonical_url" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"title" varchar,
  	"outcome" "enum_source_postings_outcome" NOT NULL,
  	"candidate_id" integer,
  	"first_seen_at" timestamp(3) with time zone NOT NULL,
  	"last_seen_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "candidates" ADD COLUMN "tag_suggestions" jsonb;
  ALTER TABLE "candidates" ADD COLUMN "ai_suggestion" jsonb;
  ALTER TABLE "candidates" ADD COLUMN "use_ai_draft" boolean DEFAULT true;
  ALTER TABLE "candidates" ADD COLUMN "source_id" integer;
  ALTER TABLE "_candidates_v" ADD COLUMN "version_tag_suggestions" jsonb;
  ALTER TABLE "_candidates_v" ADD COLUMN "version_ai_suggestion" jsonb;
  ALTER TABLE "_candidates_v" ADD COLUMN "version_use_ai_draft" boolean DEFAULT true;
  ALTER TABLE "_candidates_v" ADD COLUMN "version_source_id" integer;
  ALTER TABLE "jobs" ADD COLUMN "source_id" integer;
  ALTER TABLE "_jobs_v" ADD COLUMN "version_source_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sources_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "source_postings_id" integer;
  ALTER TABLE "sources_more_urls" ADD CONSTRAINT "sources_more_urls_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sources" ADD CONSTRAINT "sources_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "source_postings" ADD CONSTRAINT "source_postings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "source_postings" ADD CONSTRAINT "source_postings_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "sources_more_urls_order_idx" ON "sources_more_urls" USING btree ("_order");
  CREATE INDEX "sources_more_urls_parent_id_idx" ON "sources_more_urls" USING btree ("_parent_id");
  CREATE INDEX "sources_institution_idx" ON "sources" USING btree ("institution_id");
  CREATE INDEX "sources_looked_at_idx" ON "sources" USING btree ("looked_at");
  CREATE INDEX "sources_needs_attention_idx" ON "sources" USING btree ("needs_attention");
  CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
  CREATE INDEX "sources_created_at_idx" ON "sources" USING btree ("created_at");
  CREATE INDEX "source_postings_source_idx" ON "source_postings" USING btree ("source_id");
  CREATE INDEX "source_postings_canonical_url_idx" ON "source_postings" USING btree ("canonical_url");
  CREATE INDEX "source_postings_outcome_idx" ON "source_postings" USING btree ("outcome");
  CREATE INDEX "source_postings_candidate_idx" ON "source_postings" USING btree ("candidate_id");
  CREATE INDEX "source_postings_last_seen_at_idx" ON "source_postings" USING btree ("last_seen_at");
  CREATE INDEX "source_postings_updated_at_idx" ON "source_postings" USING btree ("updated_at");
  CREATE INDEX "source_postings_created_at_idx" ON "source_postings" USING btree ("created_at");
  CREATE UNIQUE INDEX "source_canonicalUrl_idx" ON "source_postings" USING btree ("source_id","canonical_url");
  ALTER TABLE "candidates" ADD CONSTRAINT "candidates_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_candidates_v" ADD CONSTRAINT "_candidates_v_version_source_id_sources_id_fk" FOREIGN KEY ("version_source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_jobs_v" ADD CONSTRAINT "_jobs_v_version_source_id_sources_id_fk" FOREIGN KEY ("version_source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sources_fk" FOREIGN KEY ("sources_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_source_postings_fk" FOREIGN KEY ("source_postings_id") REFERENCES "public"."source_postings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "candidates_source_idx" ON "candidates" USING btree ("source_id");
  CREATE INDEX "_candidates_v_version_version_source_idx" ON "_candidates_v" USING btree ("version_source_id");
  CREATE INDEX "jobs_source_idx" ON "jobs" USING btree ("source_id");
  CREATE INDEX "_jobs_v_version_version_source_idx" ON "_jobs_v" USING btree ("version_source_id");
  CREATE INDEX "payload_locked_documents_rels_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("sources_id");
  CREATE INDEX "payload_locked_documents_rels_source_postings_id_idx" ON "payload_locked_documents_rels" USING btree ("source_postings_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sources_more_urls" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "source_postings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sources_more_urls" CASCADE;
  DROP TABLE "sources" CASCADE;
  DROP TABLE "source_postings" CASCADE;
  ALTER TABLE "candidates" DROP CONSTRAINT "candidates_source_id_sources_id_fk";
  
  ALTER TABLE "_candidates_v" DROP CONSTRAINT "_candidates_v_version_source_id_sources_id_fk";
  
  ALTER TABLE "jobs" DROP CONSTRAINT "jobs_source_id_sources_id_fk";
  
  ALTER TABLE "_jobs_v" DROP CONSTRAINT "_jobs_v_version_source_id_sources_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sources_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_source_postings_fk";
  
  DROP INDEX "candidates_source_idx";
  DROP INDEX "_candidates_v_version_version_source_idx";
  DROP INDEX "jobs_source_idx";
  DROP INDEX "_jobs_v_version_version_source_idx";
  DROP INDEX "payload_locked_documents_rels_sources_id_idx";
  DROP INDEX "payload_locked_documents_rels_source_postings_id_idx";
  ALTER TABLE "candidates" DROP COLUMN "tag_suggestions";
  ALTER TABLE "candidates" DROP COLUMN "ai_suggestion";
  ALTER TABLE "candidates" DROP COLUMN "use_ai_draft";
  ALTER TABLE "candidates" DROP COLUMN "source_id";
  ALTER TABLE "_candidates_v" DROP COLUMN "version_tag_suggestions";
  ALTER TABLE "_candidates_v" DROP COLUMN "version_ai_suggestion";
  ALTER TABLE "_candidates_v" DROP COLUMN "version_use_ai_draft";
  ALTER TABLE "_candidates_v" DROP COLUMN "version_source_id";
  ALTER TABLE "jobs" DROP COLUMN "source_id";
  ALTER TABLE "_jobs_v" DROP COLUMN "version_source_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sources_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "source_postings_id";
  DROP TYPE "public"."enum_sources_kind";
  DROP TYPE "public"."enum_sources_api_format";
  DROP TYPE "public"."enum_sources_schedule";
  DROP TYPE "public"."enum_sources_terms_automation";
  DROP TYPE "public"."enum_source_postings_outcome";`)
}
