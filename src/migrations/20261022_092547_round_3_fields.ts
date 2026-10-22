import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// M7, third round: the rejection reason and the monitor's outcome "not a research position", its
// count on each run, and the sources whose postings are at several sites. Down gives the rows that
// use the new values the nearest old one.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_candidates_decision_reason" ADD VALUE 'not-research' BEFORE 'agency-or-intermediary';
  ALTER TYPE "public"."enum__candidates_v_version_decision_reason" ADD VALUE 'not-research' BEFORE 'agency-or-intermediary';
  ALTER TYPE "public"."enum_source_postings_outcome" ADD VALUE 'not-research' BEFORE 'closed';
  ALTER TABLE "sources" ADD COLUMN "several_sites" boolean DEFAULT false;
  ALTER TABLE "source_runs" ADD COLUMN "not_research" numeric DEFAULT 0 NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "candidates" ALTER COLUMN "decision_reason" SET DATA TYPE text;
  UPDATE "candidates" SET "decision_reason" = 'other' WHERE "decision_reason" = 'not-research';
  DROP TYPE "public"."enum_candidates_decision_reason";
  CREATE TYPE "public"."enum_candidates_decision_reason" AS ENUM('not-neuroscience', 'agency-or-intermediary', 'closed', 'not-a-position', 'not-employer-page', 'spam', 'other');
  ALTER TABLE "candidates" ALTER COLUMN "decision_reason" SET DATA TYPE "public"."enum_candidates_decision_reason" USING "decision_reason"::"public"."enum_candidates_decision_reason";
  ALTER TABLE "_candidates_v" ALTER COLUMN "version_decision_reason" SET DATA TYPE text;
  UPDATE "_candidates_v" SET "version_decision_reason" = 'other' WHERE "version_decision_reason" = 'not-research';
  DROP TYPE "public"."enum__candidates_v_version_decision_reason";
  CREATE TYPE "public"."enum__candidates_v_version_decision_reason" AS ENUM('not-neuroscience', 'agency-or-intermediary', 'closed', 'not-a-position', 'not-employer-page', 'spam', 'other');
  ALTER TABLE "_candidates_v" ALTER COLUMN "version_decision_reason" SET DATA TYPE "public"."enum__candidates_v_version_decision_reason" USING "version_decision_reason"::"public"."enum__candidates_v_version_decision_reason";
  ALTER TABLE "source_postings" ALTER COLUMN "outcome" SET DATA TYPE text;
  UPDATE "source_postings" SET "outcome" = 'not-neuroscience' WHERE "outcome" = 'not-research';
  DROP TYPE "public"."enum_source_postings_outcome";
  CREATE TYPE "public"."enum_source_postings_outcome" AS ENUM('candidate', 'not-neuroscience', 'closed', 'duplicate', 'old');
  ALTER TABLE "source_postings" ALTER COLUMN "outcome" SET DATA TYPE "public"."enum_source_postings_outcome" USING "outcome"::"public"."enum_source_postings_outcome";
  ALTER TABLE "sources" DROP COLUMN "several_sites";
  ALTER TABLE "source_runs" DROP COLUMN "not_research";`)
}
