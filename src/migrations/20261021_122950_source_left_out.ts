import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_sources_kind" ADD VALUE 'left-out';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sources" ALTER COLUMN "kind" SET DATA TYPE text;
  ALTER TABLE "sources" ALTER COLUMN "kind" SET DEFAULT 'manual'::text;
  DROP TYPE "public"."enum_sources_kind";
  CREATE TYPE "public"."enum_sources_kind" AS ENUM('rss', 'api', 'page', 'sitemap', 'manual');
  ALTER TABLE "sources" ALTER COLUMN "kind" SET DEFAULT 'manual'::"public"."enum_sources_kind";
  ALTER TABLE "sources" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_sources_kind" USING "kind"::"public"."enum_sources_kind";`)
}
