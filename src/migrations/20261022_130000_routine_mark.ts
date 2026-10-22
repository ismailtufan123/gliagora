import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// D59: the admin's mark on a job that "Update the jobs" published on the operator's command.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "jobs" ADD COLUMN "published_by_routine" boolean DEFAULT false;
  ALTER TABLE "_jobs_v" ADD COLUMN "version_published_by_routine" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "jobs" DROP COLUMN "published_by_routine";
  ALTER TABLE "_jobs_v" DROP COLUMN "version_published_by_routine";`)
}
