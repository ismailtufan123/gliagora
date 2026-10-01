import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_data_requests_kind" AS ENUM('deletion', 'access', 'correction', 'objection', 'restriction', 'withdraw-consent', 'other');
  CREATE TYPE "public"."enum_data_requests_locale" AS ENUM('en', 'tr');
  CREATE TYPE "public"."enum_data_requests_status" AS ENUM('unconfirmed', 'new', 'in-progress', 'closed');
  CREATE TYPE "public"."enum_data_requests_action" AS ENUM('deleted-automatically', 'answered', 'refused', 'not-applicable');
  CREATE TYPE "public"."enum_data_requests_source" AS ENUM('form', 'account', 'email');
  CREATE TYPE "public"."enum_members_email_verified_by" AS ENUM('link', 'google');
  CREATE TYPE "public"."enum_email_tokens_purpose" AS ENUM('sign-in', 'verify-email', 'data-request');
  CREATE TYPE "public"."enum_email_tokens_locale" AS ENUM('en', 'tr');
  CREATE TYPE "public"."enum_saved_items_item_type" AS ENUM('job');
  CREATE TYPE "public"."enum_deletion_log_target_collection" AS ENUM('members', 'submissions', 'reports');
  CREATE TYPE "public"."enum_deletion_log_action" AS ENUM('delete', 'clear-email');
  CREATE TABLE "data_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_data_requests_kind" NOT NULL,
  	"email" varchar,
  	"name" varchar,
  	"locale" "enum_data_requests_locale" DEFAULT 'en' NOT NULL,
  	"details" varchar,
  	"action_note" varchar,
  	"outcome" jsonb,
  	"status" "enum_data_requests_status" DEFAULT 'new' NOT NULL,
  	"action" "enum_data_requests_action",
  	"source" "enum_data_requests_source" DEFAULT 'form' NOT NULL,
  	"received_at" timestamp(3) with time zone,
  	"respond_by" timestamp(3) with time zone,
  	"closed_at" timestamp(3) with time zone,
  	"purge_at" timestamp(3) with time zone,
  	"confirmation_sent_at" timestamp(3) with time zone,
  	"email_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar,
  	"email_verified_at" timestamp(3) with time zone,
  	"email_verified_by" "enum_members_email_verified_by",
  	"google_id" varchar,
  	"orcid_id" varchar,
  	"display_name" varchar,
  	"digest_opt_in" boolean DEFAULT false,
  	"digest_changed_at" timestamp(3) with time zone,
  	"digest_consent_version" varchar,
  	"last_seen_at" timestamp(3) with time zone NOT NULL,
  	"deletion_warned_at" timestamp(3) with time zone,
  	"warning_refused_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "members_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"terms_id" integer
  );
  
  CREATE TABLE "member_sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer,
  	"token_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_tokens" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"token_hash" varchar NOT NULL,
  	"purpose" "enum_email_tokens_purpose" NOT NULL,
  	"email" varchar NOT NULL,
  	"member_id" integer,
  	"browser_hash" varchar,
  	"request_id" integer,
  	"next" varchar,
  	"save" varchar,
  	"locale" "enum_email_tokens_locale" DEFAULT 'en' NOT NULL,
  	"request_data" jsonb,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "saved_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer,
  	"item_type" "enum_saved_items_item_type" DEFAULT 'job' NOT NULL,
  	"job_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "deletion_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"target_collection" "enum_deletion_log_target_collection" NOT NULL,
  	"target_id" numeric NOT NULL,
  	"action" "enum_deletion_log_action" DEFAULT 'delete' NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "data_requests_id" integer;
  ALTER TABLE "members_rels" ADD CONSTRAINT "members_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_rels" ADD CONSTRAINT "members_rels_terms_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_request_id_data_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."data_requests"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "data_requests_kind_idx" ON "data_requests" USING btree ("kind");
  CREATE INDEX "data_requests_status_idx" ON "data_requests" USING btree ("status");
  CREATE INDEX "data_requests_source_idx" ON "data_requests" USING btree ("source");
  CREATE INDEX "data_requests_received_at_idx" ON "data_requests" USING btree ("received_at");
  CREATE INDEX "data_requests_respond_by_idx" ON "data_requests" USING btree ("respond_by");
  CREATE INDEX "data_requests_closed_at_idx" ON "data_requests" USING btree ("closed_at");
  CREATE INDEX "data_requests_purge_at_idx" ON "data_requests" USING btree ("purge_at");
  CREATE INDEX "data_requests_confirmation_sent_at_idx" ON "data_requests" USING btree ("confirmation_sent_at");
  CREATE INDEX "data_requests_email_hash_idx" ON "data_requests" USING btree ("email_hash");
  CREATE INDEX "data_requests_updated_at_idx" ON "data_requests" USING btree ("updated_at");
  CREATE INDEX "data_requests_created_at_idx" ON "data_requests" USING btree ("created_at");
  CREATE UNIQUE INDEX "members_email_idx" ON "members" USING btree ("email");
  CREATE UNIQUE INDEX "members_google_id_idx" ON "members" USING btree ("google_id");
  CREATE UNIQUE INDEX "members_orcid_id_idx" ON "members" USING btree ("orcid_id");
  CREATE INDEX "members_last_seen_at_idx" ON "members" USING btree ("last_seen_at");
  CREATE INDEX "members_deletion_warned_at_idx" ON "members" USING btree ("deletion_warned_at");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE INDEX "members_rels_order_idx" ON "members_rels" USING btree ("order");
  CREATE INDEX "members_rels_parent_idx" ON "members_rels" USING btree ("parent_id");
  CREATE INDEX "members_rels_path_idx" ON "members_rels" USING btree ("path");
  CREATE INDEX "members_rels_terms_id_idx" ON "members_rels" USING btree ("terms_id");
  CREATE INDEX "member_sessions_member_idx" ON "member_sessions" USING btree ("member_id");
  CREATE UNIQUE INDEX "member_sessions_token_hash_idx" ON "member_sessions" USING btree ("token_hash");
  CREATE INDEX "member_sessions_expires_at_idx" ON "member_sessions" USING btree ("expires_at");
  CREATE INDEX "member_sessions_updated_at_idx" ON "member_sessions" USING btree ("updated_at");
  CREATE INDEX "member_sessions_created_at_idx" ON "member_sessions" USING btree ("created_at");
  CREATE UNIQUE INDEX "email_tokens_token_hash_idx" ON "email_tokens" USING btree ("token_hash");
  CREATE INDEX "email_tokens_member_idx" ON "email_tokens" USING btree ("member_id");
  CREATE INDEX "email_tokens_request_idx" ON "email_tokens" USING btree ("request_id");
  CREATE INDEX "email_tokens_expires_at_idx" ON "email_tokens" USING btree ("expires_at");
  CREATE INDEX "email_tokens_updated_at_idx" ON "email_tokens" USING btree ("updated_at");
  CREATE INDEX "email_tokens_created_at_idx" ON "email_tokens" USING btree ("created_at");
  CREATE INDEX "saved_items_member_idx" ON "saved_items" USING btree ("member_id");
  CREATE INDEX "saved_items_job_idx" ON "saved_items" USING btree ("job_id");
  CREATE INDEX "saved_items_updated_at_idx" ON "saved_items" USING btree ("updated_at");
  CREATE INDEX "saved_items_created_at_idx" ON "saved_items" USING btree ("created_at");
  CREATE UNIQUE INDEX "member_job_idx" ON "saved_items" USING btree ("member_id","job_id");
  CREATE INDEX "deletion_log_at_idx" ON "deletion_log" USING btree ("at");
  CREATE INDEX "targetCollection_targetId_idx" ON "deletion_log" USING btree ("target_collection","target_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_requests_fk" FOREIGN KEY ("data_requests_id") REFERENCES "public"."data_requests"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_data_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("data_requests_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The generated statements dropped the table with CASCADE first, which also drops the foreign
  // key from payload_locked_documents_rels, so the next statement failed. The column goes first.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_data_requests_fk";
  DROP INDEX "payload_locked_documents_rels_data_requests_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "data_requests_id";
  ALTER TABLE "data_requests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "member_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "email_tokens" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "saved_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "deletion_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "data_requests" CASCADE;
  DROP TABLE "members" CASCADE;
  DROP TABLE "members_rels" CASCADE;
  DROP TABLE "member_sessions" CASCADE;
  DROP TABLE "email_tokens" CASCADE;
  DROP TABLE "saved_items" CASCADE;
  DROP TABLE "deletion_log" CASCADE;
  DROP TYPE "public"."enum_data_requests_kind";
  DROP TYPE "public"."enum_data_requests_locale";
  DROP TYPE "public"."enum_data_requests_status";
  DROP TYPE "public"."enum_data_requests_action";
  DROP TYPE "public"."enum_data_requests_source";
  DROP TYPE "public"."enum_members_email_verified_by";
  DROP TYPE "public"."enum_email_tokens_purpose";
  DROP TYPE "public"."enum_email_tokens_locale";
  DROP TYPE "public"."enum_saved_items_item_type";
  DROP TYPE "public"."enum_deletion_log_target_collection";
  DROP TYPE "public"."enum_deletion_log_action";`)
}
