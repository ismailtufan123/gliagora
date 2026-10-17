import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_newsletter_issues_status" AS ENUM('draft', 'pushed', 'scheduled', 'sending', 'paused', 'cancelled', 'sent');
  CREATE TABLE "newsletter_issues" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"send_at" timestamp(3) with time zone NOT NULL,
  	"month" varchar,
  	"subject" varchar NOT NULL,
  	"preheader" varchar,
  	"intro" varchar NOT NULL,
  	"status" "enum_newsletter_issues_status" DEFAULT 'draft' NOT NULL,
  	"listmonk_campaign_id" numeric,
  	"pushed_at" timestamp(3) with time zone,
  	"sent_at" timestamp(3) with time zone,
  	"snapshot" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "newsletter_issues_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"jobs_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "newsletter_issues_id" integer;
  ALTER TABLE "newsletter_issues_rels" ADD CONSTRAINT "newsletter_issues_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "newsletter_issues_rels" ADD CONSTRAINT "newsletter_issues_rels_jobs_fk" FOREIGN KEY ("jobs_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "newsletter_issues_send_at_idx" ON "newsletter_issues" USING btree ("send_at");
  CREATE UNIQUE INDEX "newsletter_issues_month_idx" ON "newsletter_issues" USING btree ("month");
  CREATE INDEX "newsletter_issues_listmonk_campaign_id_idx" ON "newsletter_issues" USING btree ("listmonk_campaign_id");
  CREATE INDEX "newsletter_issues_sent_at_idx" ON "newsletter_issues" USING btree ("sent_at");
  CREATE INDEX "newsletter_issues_updated_at_idx" ON "newsletter_issues" USING btree ("updated_at");
  CREATE INDEX "newsletter_issues_created_at_idx" ON "newsletter_issues" USING btree ("created_at");
  CREATE INDEX "newsletter_issues_rels_order_idx" ON "newsletter_issues_rels" USING btree ("order");
  CREATE INDEX "newsletter_issues_rels_parent_idx" ON "newsletter_issues_rels" USING btree ("parent_id");
  CREATE INDEX "newsletter_issues_rels_path_idx" ON "newsletter_issues_rels" USING btree ("path");
  CREATE INDEX "newsletter_issues_rels_jobs_id_idx" ON "newsletter_issues_rels" USING btree ("jobs_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_newsletter_issues_fk" FOREIGN KEY ("newsletter_issues_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_newsletter_issues_id_idx" ON "payload_locked_documents_rels" USING btree ("newsletter_issues_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The generated statements dropped the table with CASCADE first, which also drops the foreign
  // key from payload_locked_documents_rels, so the next statement failed (as in
  // 20261001_142245_members). The column goes first.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_newsletter_issues_fk";
  DROP INDEX "payload_locked_documents_rels_newsletter_issues_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "newsletter_issues_id";
  ALTER TABLE "newsletter_issues" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "newsletter_issues_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "newsletter_issues_rels" CASCADE;
  DROP TABLE "newsletter_issues" CASCADE;
  DROP TYPE "public"."enum_newsletter_issues_status";`)
}
