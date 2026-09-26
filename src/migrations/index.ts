import * as migration_20260926_203729_initial from './20260926_203729_initial';

export const migrations = [
  {
    up: migration_20260926_203729_initial.up,
    down: migration_20260926_203729_initial.down,
    name: '20260926_203729_initial'
  },
];
