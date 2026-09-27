import * as migration_20260926_203729_initial from './20260926_203729_initial';
import * as migration_20260927_133459_taxonomy from './20260927_133459_taxonomy';
import * as migration_20260927_140000_seed_taxonomy from './20260927_140000_seed_taxonomy';
import * as migration_20260927_140459_geography from './20260927_140459_geography';
import * as migration_20260927_141000_seed_geography from './20260927_141000_seed_geography';

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
];
