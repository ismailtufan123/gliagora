import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_sources_kind" ADD VALUE 'sitemap' BEFORE 'manual';
  ALTER TABLE "sources" ADD COLUMN "posting_id_pattern" varchar;
  ALTER TABLE "sources" ADD COLUMN "posting_url_template" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sources" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "sources" ALTER COLUMN "kind" SET DEFAULT 'manual'::text;
  UPDATE "sources" SET "kind" = 'manual', "active" = false WHERE "kind" = 'sitemap';
  DROP TYPE "public"."enum_sources_kind";
  CREATE TYPE "public"."enum_sources_kind" AS ENUM('rss', 'api', 'page', 'manual');
  ALTER TABLE "sources" ALTER COLUMN "kind" SET DEFAULT 'manual'::"public"."enum_sources_kind";
  ALTER TABLE "sources" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_sources_kind" USING "kind"::"public"."enum_sources_kind";
  ALTER TABLE "sources" DROP COLUMN "posting_id_pattern";
  ALTER TABLE "sources" DROP COLUMN "posting_url_template";`)
}
