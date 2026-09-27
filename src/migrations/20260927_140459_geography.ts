import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_countries_region" AS ENUM('africa', 'northern-america', 'latin-america-caribbean', 'asia', 'europe', 'oceania');
  CREATE TYPE "public"."enum_countries_subregion" AS ENUM('northern-africa', 'eastern-africa', 'middle-africa', 'southern-africa', 'western-africa', 'caribbean', 'central-america', 'south-america', 'central-asia', 'eastern-asia', 'south-eastern-asia', 'southern-asia', 'western-asia', 'eastern-europe', 'northern-europe', 'southern-europe', 'western-europe', 'australia-new-zealand', 'melanesia', 'micronesia', 'polynesia');
  CREATE TABLE "countries" (
  	"id" varchar PRIMARY KEY NOT NULL,
  	"region" "enum_countries_region",
  	"subregion" "enum_countries_subregion",
  	"m49_code" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "countries_locales" (
  	"name" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "country_sets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"source_url" varchar NOT NULL,
  	"last_verified_at" timestamp(3) with time zone NOT NULL,
  	"verification_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "country_sets_locales" (
  	"label" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "country_sets_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"countries_id" varchar
  );
  
  CREATE TABLE "_country_sets_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar NOT NULL,
  	"version_source_url" varchar NOT NULL,
  	"version_last_verified_at" timestamp(3) with time zone NOT NULL,
  	"version_verification_note" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_country_sets_v_locales" (
  	"version_label" varchar,
  	"version_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_country_sets_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"countries_id" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "countries_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "country_sets_id" integer;
  ALTER TABLE "countries_locales" ADD CONSTRAINT "countries_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "country_sets_locales" ADD CONSTRAINT "country_sets_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."country_sets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "country_sets_rels" ADD CONSTRAINT "country_sets_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."country_sets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "country_sets_rels" ADD CONSTRAINT "country_sets_rels_countries_fk" FOREIGN KEY ("countries_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_country_sets_v" ADD CONSTRAINT "_country_sets_v_parent_id_country_sets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."country_sets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_country_sets_v_locales" ADD CONSTRAINT "_country_sets_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_country_sets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_country_sets_v_rels" ADD CONSTRAINT "_country_sets_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_country_sets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_country_sets_v_rels" ADD CONSTRAINT "_country_sets_v_rels_countries_fk" FOREIGN KEY ("countries_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "countries_updated_at_idx" ON "countries" USING btree ("updated_at");
  CREATE INDEX "countries_created_at_idx" ON "countries" USING btree ("created_at");
  CREATE UNIQUE INDEX "countries_locales_locale_parent_id_unique" ON "countries_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "country_sets_slug_idx" ON "country_sets" USING btree ("slug");
  CREATE INDEX "country_sets_updated_at_idx" ON "country_sets" USING btree ("updated_at");
  CREATE INDEX "country_sets_created_at_idx" ON "country_sets" USING btree ("created_at");
  CREATE UNIQUE INDEX "country_sets_locales_locale_parent_id_unique" ON "country_sets_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "country_sets_rels_order_idx" ON "country_sets_rels" USING btree ("order");
  CREATE INDEX "country_sets_rels_parent_idx" ON "country_sets_rels" USING btree ("parent_id");
  CREATE INDEX "country_sets_rels_path_idx" ON "country_sets_rels" USING btree ("path");
  CREATE INDEX "country_sets_rels_countries_id_idx" ON "country_sets_rels" USING btree ("countries_id");
  CREATE INDEX "_country_sets_v_parent_idx" ON "_country_sets_v" USING btree ("parent_id");
  CREATE INDEX "_country_sets_v_version_version_slug_idx" ON "_country_sets_v" USING btree ("version_slug");
  CREATE INDEX "_country_sets_v_version_version_updated_at_idx" ON "_country_sets_v" USING btree ("version_updated_at");
  CREATE INDEX "_country_sets_v_version_version_created_at_idx" ON "_country_sets_v" USING btree ("version_created_at");
  CREATE INDEX "_country_sets_v_created_at_idx" ON "_country_sets_v" USING btree ("created_at");
  CREATE INDEX "_country_sets_v_updated_at_idx" ON "_country_sets_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_country_sets_v_locales_locale_parent_id_unique" ON "_country_sets_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_country_sets_v_rels_order_idx" ON "_country_sets_v_rels" USING btree ("order");
  CREATE INDEX "_country_sets_v_rels_parent_idx" ON "_country_sets_v_rels" USING btree ("parent_id");
  CREATE INDEX "_country_sets_v_rels_path_idx" ON "_country_sets_v_rels" USING btree ("path");
  CREATE INDEX "_country_sets_v_rels_countries_id_idx" ON "_country_sets_v_rels" USING btree ("countries_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_countries_fk" FOREIGN KEY ("countries_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_country_sets_fk" FOREIGN KEY ("country_sets_id") REFERENCES "public"."country_sets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_countries_id_idx" ON "payload_locked_documents_rels" USING btree ("countries_id");
  CREATE INDEX "payload_locked_documents_rels_country_sets_id_idx" ON "payload_locked_documents_rels" USING btree ("country_sets_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "countries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "countries_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "country_sets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "country_sets_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "country_sets_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_country_sets_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_country_sets_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_country_sets_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "countries" CASCADE;
  DROP TABLE "countries_locales" CASCADE;
  DROP TABLE "country_sets" CASCADE;
  DROP TABLE "country_sets_locales" CASCADE;
  DROP TABLE "country_sets_rels" CASCADE;
  DROP TABLE "_country_sets_v" CASCADE;
  DROP TABLE "_country_sets_v_locales" CASCADE;
  DROP TABLE "_country_sets_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_countries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_country_sets_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_countries_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_country_sets_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "countries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "country_sets_id";
  DROP TYPE "public"."enum_countries_region";
  DROP TYPE "public"."enum_countries_subregion";`)
}
