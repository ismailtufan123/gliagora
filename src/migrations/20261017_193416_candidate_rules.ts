import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_source_postings_outcome" ADD VALUE 'old';
  ALTER TABLE "sources" ADD COLUMN "ignored_names" varchar;
  ALTER TABLE "source_runs" ADD COLUMN "old" numeric DEFAULT 0 NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "source_postings" ALTER COLUMN "outcome" SET DATA TYPE text;
  UPDATE "source_postings" SET "outcome" = 'closed' WHERE "outcome" = 'old';
  DROP TYPE "public"."enum_source_postings_outcome";
  CREATE TYPE "public"."enum_source_postings_outcome" AS ENUM('candidate', 'not-neuroscience', 'closed', 'duplicate');
  ALTER TABLE "source_postings" ALTER COLUMN "outcome" SET DATA TYPE "public"."enum_source_postings_outcome" USING "outcome"::"public"."enum_source_postings_outcome";
  ALTER TABLE "sources" DROP COLUMN "ignored_names";
  ALTER TABLE "source_runs" DROP COLUMN "old";`)
}
