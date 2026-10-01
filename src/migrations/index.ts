import * as migration_20260926_203729_initial from './20260926_203729_initial';
import * as migration_20260927_133459_taxonomy from './20260927_133459_taxonomy';
import * as migration_20260927_140000_seed_taxonomy from './20260927_140000_seed_taxonomy';
import * as migration_20260927_140459_geography from './20260927_140459_geography';
import * as migration_20260927_141000_seed_geography from './20260927_141000_seed_geography';
import * as migration_20260927_142000_institutions from './20260927_142000_institutions';
import * as migration_20260927_200239_jobs from './20260927_200239_jobs';
import * as migration_20260927_221038_review_queue from './20260927_221038_review_queue';
import * as migration_20260927_235439_form_limits from './20260927_235439_form_limits';
import * as migration_20260928_020440_reports from './20260928_020440_reports';
import * as migration_20260928_033903_maintenance from './20260928_033903_maintenance';
import * as migration_20260928_052700_retention_safeguards from './20260928_052700_retention_safeguards';
import * as migration_20260928_100000_search from './20260928_100000_search';
import * as migration_20260928_135840_report_institution from './20260928_135840_report_institution';
import * as migration_20260928_143415_institution_time_zone from './20260928_143415_institution_time_zone';
import * as migration_20261001_142245_members from './20261001_142245_members';
import * as migration_20261001_142246_member_constraints from './20261001_142246_member_constraints';

export const migrations = [
  {
    up: migration_20260926_203729_initial.up,
    down: migration_20260926_203729_initial.down,
    name: '20260926_203729_initial',
  },
  {
    up: migration_20260927_133459_taxonomy.up,
    down: migration_20260927_133459_taxonomy.down,
    name: '20260927_133459_taxonomy',
  },
  {
    up: migration_20260927_140000_seed_taxonomy.up,
    down: migration_20260927_140000_seed_taxonomy.down,
    name: '20260927_140000_seed_taxonomy',
  },
  {
    up: migration_20260927_140459_geography.up,
    down: migration_20260927_140459_geography.down,
    name: '20260927_140459_geography',
  },
  {
    up: migration_20260927_141000_seed_geography.up,
    down: migration_20260927_141000_seed_geography.down,
    name: '20260927_141000_seed_geography',
  },
  {
    up: migration_20260927_142000_institutions.up,
    down: migration_20260927_142000_institutions.down,
    name: '20260927_142000_institutions',
  },
  {
    up: migration_20260927_200239_jobs.up,
    down: migration_20260927_200239_jobs.down,
    name: '20260927_200239_jobs',
  },
  {
    up: migration_20260927_221038_review_queue.up,
    down: migration_20260927_221038_review_queue.down,
    name: '20260927_221038_review_queue',
  },
  {
    up: migration_20260927_235439_form_limits.up,
    down: migration_20260927_235439_form_limits.down,
    name: '20260927_235439_form_limits',
  },
  {
    up: migration_20260928_020440_reports.up,
    down: migration_20260928_020440_reports.down,
    name: '20260928_020440_reports',
  },
  {
    up: migration_20260928_033903_maintenance.up,
    down: migration_20260928_033903_maintenance.down,
    name: '20260928_033903_maintenance',
  },
  {
    up: migration_20260928_052700_retention_safeguards.up,
    down: migration_20260928_052700_retention_safeguards.down,
    name: '20260928_052700_retention_safeguards',
  },
  {
    up: migration_20260928_100000_search.up,
    down: migration_20260928_100000_search.down,
    name: '20260928_100000_search',
  },
  {
    up: migration_20260928_135840_report_institution.up,
    down: migration_20260928_135840_report_institution.down,
    name: '20260928_135840_report_institution',
  },
  {
    up: migration_20260928_143415_institution_time_zone.up,
    down: migration_20260928_143415_institution_time_zone.down,
    name: '20260928_143415_institution_time_zone',
  },
  {
    up: migration_20261001_142245_members.up,
    down: migration_20261001_142245_members.down,
    name: '20261001_142245_members',
  },
  {
    up: migration_20261001_142246_member_constraints.up,
    down: migration_20261001_142246_member_constraints.down,
    name: '20261001_142246_member_constraints',
  },
];
