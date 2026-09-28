import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_reports_kind" AS ENUM('wrong-fact', 'closed', 'broken-link', 'not-employer', 'personal-rights', 'other');
  CREATE TYPE "public"."enum_reports_locale" AS ENUM('en', 'tr');
  CREATE TYPE "public"."enum_reports_status" AS ENUM('new', 'in-progress', 'closed');
  CREATE TYPE "public"."enum_reports_action" AS ENUM('none', 'corrected', 'removed', 'refused', 'not-applicable');
  CREATE TABLE "reports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_reports_kind" NOT NULL,
  	"job_id" integer,
  	"item_url" varchar,
  	"details" varchar NOT NULL,
  	"email" varchar,
  	"locale" "enum_reports_locale" DEFAULT 'en' NOT NULL,
  	"action_note" varchar,
  	"status" "enum_reports_status" DEFAULT 'new' NOT NULL,
  	"action" "enum_reports_action",
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"respond_by" timestamp(3) with time zone,
  	"ack_sent_at" timestamp(3) with time zone,
  	"closed_at" timestamp(3) with time zone,
  	"purge_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reports_id" integer;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "reports_kind_idx" ON "reports" USING btree ("kind");
  CREATE INDEX "reports_job_idx" ON "reports" USING btree ("job_id");
  CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");
  CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");
  CREATE INDEX "reports_respond_by_idx" ON "reports" USING btree ("respond_by");
  CREATE INDEX "reports_ack_sent_at_idx" ON "reports" USING btree ("ack_sent_at");
  CREATE INDEX "reports_closed_at_idx" ON "reports" USING btree ("closed_at");
  CREATE INDEX "reports_purge_at_idx" ON "reports" USING btree ("purge_at");
  CREATE INDEX "reports_updated_at_idx" ON "reports" USING btree ("updated_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reports_fk" FOREIGN KEY ("reports_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_reports_id_idx" ON "payload_locked_documents_rels" USING btree ("reports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The generated statements dropped the table with CASCADE first, which also drops the foreign
  // key from payload_locked_documents_rels, so the next statement failed. The column goes first.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reports_fk";
  DROP INDEX "payload_locked_documents_rels_reports_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reports_id";
  DROP TABLE "reports";
  DROP TYPE "public"."enum_reports_kind";
  DROP TYPE "public"."enum_reports_locale";
  DROP TYPE "public"."enum_reports_status";
  DROP TYPE "public"."enum_reports_action";`)
}
