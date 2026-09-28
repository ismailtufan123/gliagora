import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "form_limits" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "form_limits_id" integer;
  CREATE INDEX "form_limits_key_idx" ON "form_limits" USING btree ("key");
  CREATE INDEX "form_limits_updated_at_idx" ON "form_limits" USING btree ("updated_at");
  CREATE INDEX "form_limits_created_at_idx" ON "form_limits" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_limits_fk" FOREIGN KEY ("form_limits_id") REFERENCES "public"."form_limits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_form_limits_id_idx" ON "payload_locked_documents_rels" USING btree ("form_limits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "form_limits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "form_limits" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_form_limits_fk";
  
  DROP INDEX "payload_locked_documents_rels_form_limits_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "form_limits_id";`)
}
