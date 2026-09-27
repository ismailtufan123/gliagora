import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en', 'tr');
  CREATE TYPE "public"."enum_terms_vocabulary" AS ENUM('subfield', 'method', 'model-system', 'position-type', 'career-stage', 'event-type', 'event-format', 'deadline-type', 'funding-type', 'resource-type', 'evidence-level', 'disease-area');
  CREATE TYPE "public"."enum_terms_group" AS ENUM('recording-imaging', 'manipulation', 'molecular', 'behaviour-clinical', 'computational', 'engineering');
  CREATE TYPE "public"."enum__terms_v_version_vocabulary" AS ENUM('subfield', 'method', 'model-system', 'position-type', 'career-stage', 'event-type', 'event-format', 'deadline-type', 'funding-type', 'resource-type', 'evidence-level', 'disease-area');
  CREATE TYPE "public"."enum__terms_v_version_group" AS ENUM('recording-imaging', 'manipulation', 'molecular', 'behaviour-clinical', 'computational', 'engineering');
  CREATE TABLE "terms" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"vocabulary" "enum_terms_vocabulary" NOT NULL,
  	"slug" varchar NOT NULL,
  	"parent_id" integer,
  	"group" "enum_terms_group",
  	"is_active" boolean DEFAULT true,
  	"sort_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "terms_locales" (
  	"label" varchar,
  	"description" varchar,
  	"hub_intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "terms_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "_terms_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_vocabulary" "enum__terms_v_version_vocabulary" NOT NULL,
  	"version_slug" varchar NOT NULL,
  	"version_parent_id" integer,
  	"version_group" "enum__terms_v_version_group",
  	"version_is_active" boolean DEFAULT true,
  	"version_sort_order" numeric DEFAULT 0,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_terms_v_locales" (
  	"version_label" varchar,
  	"version_description" varchar,
  	"version_hub_intro" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_terms_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "terms_id" integer;
  ALTER TABLE "terms" ADD CONSTRAINT "terms_parent_id_terms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "terms_locales" ADD CONSTRAINT "terms_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "terms_texts" ADD CONSTRAINT "terms_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_terms_v" ADD CONSTRAINT "_terms_v_parent_id_terms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_terms_v" ADD CONSTRAINT "_terms_v_version_parent_id_terms_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."terms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_terms_v_locales" ADD CONSTRAINT "_terms_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_terms_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_terms_v_texts" ADD CONSTRAINT "_terms_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_terms_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "terms_vocabulary_idx" ON "terms" USING btree ("vocabulary");
  CREATE INDEX "terms_parent_idx" ON "terms" USING btree ("parent_id");
  CREATE INDEX "terms_updated_at_idx" ON "terms" USING btree ("updated_at");
  CREATE INDEX "terms_created_at_idx" ON "terms" USING btree ("created_at");
  CREATE UNIQUE INDEX "vocabulary_slug_idx" ON "terms" USING btree ("vocabulary","slug");
  CREATE UNIQUE INDEX "terms_locales_locale_parent_id_unique" ON "terms_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "terms_texts_order_parent" ON "terms_texts" USING btree ("order","parent_id");
  CREATE INDEX "_terms_v_parent_idx" ON "_terms_v" USING btree ("parent_id");
  CREATE INDEX "_terms_v_version_version_vocabulary_idx" ON "_terms_v" USING btree ("version_vocabulary");
  CREATE INDEX "_terms_v_version_version_parent_idx" ON "_terms_v" USING btree ("version_parent_id");
  CREATE INDEX "_terms_v_version_version_updated_at_idx" ON "_terms_v" USING btree ("version_updated_at");
  CREATE INDEX "_terms_v_version_version_created_at_idx" ON "_terms_v" USING btree ("version_created_at");
  CREATE INDEX "_terms_v_created_at_idx" ON "_terms_v" USING btree ("created_at");
  CREATE INDEX "_terms_v_updated_at_idx" ON "_terms_v" USING btree ("updated_at");
  CREATE INDEX "version_vocabulary_version_slug_idx" ON "_terms_v" USING btree ("version_vocabulary","version_slug");
  CREATE UNIQUE INDEX "_terms_v_locales_locale_parent_id_unique" ON "_terms_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_terms_v_texts_order_parent" ON "_terms_v_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_terms_fk" FOREIGN KEY ("terms_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_terms_id_idx" ON "payload_locked_documents_rels" USING btree ("terms_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "terms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "terms_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "terms_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_terms_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_terms_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_terms_v_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "terms" CASCADE;
  DROP TABLE "terms_locales" CASCADE;
  DROP TABLE "terms_texts" CASCADE;
  DROP TABLE "_terms_v" CASCADE;
  DROP TABLE "_terms_v_locales" CASCADE;
  DROP TABLE "_terms_v_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_terms_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_terms_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "terms_id";
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_terms_vocabulary";
  DROP TYPE "public"."enum_terms_group";
  DROP TYPE "public"."enum__terms_v_version_vocabulary";
  DROP TYPE "public"."enum__terms_v_version_group";`)
}
