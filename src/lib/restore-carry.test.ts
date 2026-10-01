import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

// The carry-over of deploy/backup/restore.sh (M4b, D49; the M4b design §7.9), run by bash against
// a stand-in for psql. `restore.sh database` drops the live database only after carry_save has
// copied the deletion log and the data requests out, and carry_save runs inside a condition, where
// bash ignores `set -e`: these check that every failure still stops it, that a backup from before
// M4b with nothing to carry restores normally, and that one with rows to carry stops before
// changing anything.

const RESTORE = join(process.cwd(), 'deploy/backup/restore.sh')

/** A stand-in for psql (tests/fixtures/restore/fake-psql.sh). */
const FAKE_PSQL = join(process.cwd(), 'tests/fixtures/restore/fake-psql.sh')

let folders: string[] = []

afterEach(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
  folders = []
})

function folder() {
  const path = mkdtempSync(join(tmpdir(), 'restore-carry-'))
  folders.push(path)
  return path
}

type Fake = { tables: string; fail?: 'copy' | 'regclass' | 'garbage'; rows?: boolean }

/**
 * Runs `call` (carry_save or carry_load with fake_psql) as restore.sh does, inside a condition,
 * and returns its exit status, what it printed and the psql calls it made.
 */
function run(call: string, dir: string, fake: Fake) {
  const calls = join(dir, 'calls.log')
  writeFileSync(calls, '')
  const script = `source "$RESTORE"
source "$FAKE_PSQL"
status=0
${call} || status=$?
echo "status=$status"`
  const output = execFileSync('bash', ['-c', script, 'restore-carry-test'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // Only what the script needs, so nothing from the environment changes what it does.
    env: {
      NODE_ENV: 'test',
      PATH: process.env.PATH,
      RESTORE,
      FAKE_PSQL,
      CALLS: calls,
      DIR: dir,
      TABLES: fake.tables,
      FAIL: fake.fail ?? '',
      ROWS: fake.rows ? '1' : '',
    },
  })
  const status = Number(/status=(\d+)\s*$/.exec(output)?.[1])
  return { status, output, calls: readFileSync(calls, 'utf8') }
}

const M4B_TABLES = 'members submissions reports data_requests deletion_log'
const BEFORE_M4B = 'submissions reports'

/** A carry folder as carry_save leaves it, from a live database with or without rows. */
function saved(rows: boolean) {
  const dir = folder()
  const result = run('carry_save "$DIR" fake_psql', dir, { tables: M4B_TABLES, rows })
  expect(result.status).toBe(0)
  return dir
}

describe('restore.sh carry_save', () => {
  it('copies both tables and every sequence', () => {
    const dir = folder()
    expect(run('carry_save "$DIR" fake_psql', dir, { tables: M4B_TABLES }).status).toBe(0)
    for (const table of ['deletion_log', 'data_requests']) {
      expect(
        readFileSync(join(dir, `${table}.bin`))
          .subarray(0, 6)
          .toString(),
      ).toBe('PGCOPY')
    }
    expect(readFileSync(join(dir, 'sequences'), 'utf8').trim().split('\n')).toEqual([
      'members 7',
      'submissions 7',
      'reports 7',
      'data_requests 7',
      'deletion_log 7',
    ])
  })

  it('fails when a copy fails, so the live database is never dropped', () => {
    expect(
      run('carry_save "$DIR" fake_psql', folder(), { tables: M4B_TABLES, fail: 'copy' }),
    ).toMatchObject({ status: 1 })
  })

  it('fails when what a copy wrote is not a binary COPY file', () => {
    const result = run('carry_save "$DIR" fake_psql', folder(), {
      tables: M4B_TABLES,
      fail: 'garbage',
    })
    expect(result.status).toBe(1)
  })

  it('reads a failed question about a table as a failure, never as "no such table"', () => {
    const result = run('carry_save "$DIR" fake_psql', folder(), {
      tables: M4B_TABLES,
      fail: 'regclass',
    })
    expect(result.status).toBe(1)
    expect(result.calls).not.toContain('copy out')
  })

  it('copies nothing from a database from before M4b', () => {
    const dir = folder()
    expect(run('carry_save "$DIR" fake_psql', dir, { tables: BEFORE_M4B }).status).toBe(0)
    expect(readdirSync(dir).filter((file) => file.endsWith('.bin'))).toEqual([])
  })
})

describe('restore.sh carry_load', () => {
  it('loads the rows and moves the sequences in one transaction', () => {
    const dir = saved(true)
    const result = run('carry_load "$DIR" fake_psql', dir, { tables: M4B_TABLES })
    expect(result.status).toBe(0)
    expect(result.calls.match(/^copy in$/gm)).toHaveLength(2)
    const transaction = result.calls.slice(result.calls.indexOf('transaction'))
    expect(transaction).toContain('begin;')
    expect(transaction).toContain('insert into deletion_log (id, target_collection')
    expect(transaction).toContain('on conflict (id) do update set kind = excluded.kind')
    expect(transaction).toContain("select setval('public.members_id_seq'")
    expect(transaction).toContain('commit;')
  })

  it('skips the tables a backup from before M4b lacks when they had no rows', () => {
    const dir = saved(false)
    const result = run('carry_load "$DIR" fake_psql', dir, { tables: BEFORE_M4B })
    expect(result.status).toBe(0)
    expect(result.output).toContain('has no deletion_log table (a backup from before M4b)')
    expect(result.calls).not.toContain('copy in')
    // Only the sequences of the tables it has move.
    const transaction = result.calls.slice(result.calls.indexOf('transaction'))
    expect(transaction).toContain("setval('public.submissions_id_seq'")
    expect(transaction).not.toContain('members_id_seq')
  })

  it('stops before changing anything when such a table had rows (3: run `carry`)', () => {
    const dir = saved(true)
    const result = run('carry_load "$DIR" fake_psql', dir, { tables: BEFORE_M4B })
    expect(result.status).toBe(3)
    expect(result.output).toContain('has no deletion_log data_requests table')
    expect(result.calls).not.toMatch(/^(statement|copy in|transaction)/m)
  })

  it('fails on a damaged carry file or a failed question, never skipping a table', () => {
    const dir = saved(true)
    expect(
      run('carry_load "$DIR" fake_psql', dir, { tables: M4B_TABLES, fail: 'regclass' }),
    ).toMatchObject({ status: 1 })
    writeFileSync(join(dir, 'data_requests.bin'), '')
    const result = run('carry_load "$DIR" fake_psql', dir, { tables: M4B_TABLES })
    expect(result.status).toBe(1)
    expect(result.calls).not.toContain('transaction')
  })
})
