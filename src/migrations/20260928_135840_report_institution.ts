import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// D40: a report from an institution page links the institution, as one from a job page links
// the job. Deleting an institution added by hand clears the link (ON DELETE SET NULL); the report
// keeps the page's address (`item_url`).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reports" ADD COLUMN "institution_id" integer;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "reports_institution_idx" ON "reports" USING btree ("institution_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "reports" DROP CONSTRAINT "reports_institution_id_institutions_id_fk";
  
  DROP INDEX "reports_institution_idx";
  ALTER TABLE "reports" DROP COLUMN "institution_id";`)
}
