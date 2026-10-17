import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_source_runs_outcome" AS ENUM('ok', 'failed', 'refused');
  CREATE TABLE "source_runs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source_id" integer NOT NULL,
  	"ran_at" timestamp(3) with time zone NOT NULL,
  	"by_hand" boolean DEFAULT false,
  	"outcome" "enum_source_runs_outcome" NOT NULL,
  	"error" varchar,
  	"listed" numeric DEFAULT 0 NOT NULL,
  	"new" numeric DEFAULT 0 NOT NULL,
  	"read" numeric DEFAULT 0 NOT NULL,
  	"candidates" numeric DEFAULT 0 NOT NULL,
  	"not_neuroscience" numeric DEFAULT 0 NOT NULL,
  	"closed" numeric DEFAULT 0 NOT NULL,
  	"duplicates" numeric DEFAULT 0 NOT NULL,
  	"capped" numeric DEFAULT 0 NOT NULL,
  	"failed_pages" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "source_runs_id" integer;
  ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "source_runs_source_idx" ON "source_runs" USING btree ("source_id");
  CREATE INDEX "source_runs_ran_at_idx" ON "source_runs" USING btree ("ran_at");
  CREATE INDEX "source_runs_outcome_idx" ON "source_runs" USING btree ("outcome");
  CREATE INDEX "source_runs_updated_at_idx" ON "source_runs" USING btree ("updated_at");
  CREATE INDEX "source_runs_created_at_idx" ON "source_runs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_source_runs_fk" FOREIGN KEY ("source_runs_id") REFERENCES "public"."source_runs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_source_runs_id_idx" ON "payload_locked_documents_rels" USING btree ("source_runs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "source_runs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "source_runs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_source_runs_fk";
  
  DROP INDEX "payload_locked_documents_rels_source_runs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "source_runs_id";
  DROP TYPE "public"."enum_source_runs_outcome";`)
}
