import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "terms_locales" ADD COLUMN "hub_intro_draft" varchar;
  ALTER TABLE "_terms_v_locales" ADD COLUMN "version_hub_intro_draft" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "terms_locales" DROP COLUMN "hub_intro_draft";
  ALTER TABLE "_terms_v_locales" DROP COLUMN "version_hub_intro_draft";`)
}
