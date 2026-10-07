import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

// tools/lighthouse/run.mjs (`pnpm lighthouse:prod`, PLAN §17.2): the site-wide password reaches a
// run only on standard input, and no report may hold it (D42). The measuring itself needs a
// browser and a site, so it is not tested here.

const SCRIPT = path.join(process.cwd(), 'tools/lighthouse/run.mjs')

type Report = { configSettings?: { extraHeaders: unknown }; [key: string]: unknown }
type Tool = {
  holdsCredentials: (text: string, secrets: string[]) => boolean
  withoutCredentials: <T extends Report>(lhr: T, secrets: string[]) => T
  filesWithCredentials: (folder: string, secrets: string[]) => string[]
  searchedFor: (password: string, basic: string) => string[]
  prepareFolder: (folder: string) => void
  removeReports: (folder: string) => void
}
// Loaded by its path: a script outside src/, without types of its own.
const tool = (await import(pathToFileURL(SCRIPT).href)) as Tool

// Invented values, in the shapes of the real ones: a password, and the header's value.
const PASSWORD = 'n0tTheRealPassw0rdJustATestValue'
const BASIC = Buffer.from(`editor:${PASSWORD}`).toString('base64')
const SECRETS = tool.searchedFor(PASSWORD, BASIC)

const run = (args: string[], input?: string) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { input: input ?? '', encoding: 'utf8' })

describe('the Lighthouse script and the site-wide password', () => {
  it('removes the extra headers from a report', () => {
    const lhr = {
      requestedUrl: 'https://gliagora.com/en/',
      configSettings: { extraHeaders: { Authorization: `Basic ${BASIC}` }, formFactor: 'mobile' },
    }
    const cleaned = tool.withoutCredentials(lhr, SECRETS)
    expect(cleaned.configSettings).toEqual({ extraHeaders: null, formFactor: 'mobile' })
    expect(JSON.stringify(cleaned)).not.toContain(BASIC)
  })

  it('refuses a report that holds the password or the header value anywhere else', () => {
    const elsewhere = [
      {
        audits: {
          'network-requests': { details: { items: [{ url: `https://x/?p=${PASSWORD}` }] } },
        },
      },
      { audits: { some: { description: `Authorization: Basic ${BASIC}` } } },
      { finalDisplayedUrl: `https://editor:${encodeURIComponent(PASSWORD)}@gliagora.com/` },
    ]
    for (const lhr of elsewhere) {
      expect(() => tool.withoutCredentials(lhr, SECRETS)).toThrow(/holds the credentials/)
    }
  })

  it('finds them in every spelling a report could give them', () => {
    const odd = 'p@ss "word"/+=&'
    expect(tool.holdsCredentials(`x ${odd} y`, [odd])).toBe(true)
    expect(tool.holdsCredentials(`?p=${encodeURIComponent(odd)}`, [odd])).toBe(true)
    expect(tool.holdsCredentials(JSON.stringify({ header: odd }), [odd])).toBe(true)
    expect(tool.holdsCredentials('nothing here', [odd])).toBe(false)
    // Without a password (a local run), nothing counts as one.
    expect(tool.holdsCredentials('anything', [])).toBe(false)
  })

  it('names the written files that hold them', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'lighthouse-test-'))
    try {
      writeFileSync(path.join(folder, 'clean.html'), '<p>performance 98</p>')
      writeFileSync(path.join(folder, 'leak.json'), JSON.stringify({ header: `Basic ${BASIC}` }))
      expect(tool.filesWithCredentials(folder, SECRETS)).toEqual(['leak.json'])
      expect(tool.filesWithCredentials(folder, [])).toEqual([])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('finds a copy that was cut short', () => {
    expect(SECRETS).toEqual([PASSWORD, BASIC, PASSWORD.slice(0, 16), BASIC.slice(0, 24)])
    expect(tool.holdsCredentials(`Basic ${BASIC.slice(0, 30)}…`, SECRETS)).toBe(true)
    expect(tool.holdsCredentials(`p=${PASSWORD.slice(0, 20)}`, SECRETS)).toBe(true)
    // The start of the header's value alone says only "editor:".
    expect(tool.holdsCredentials(Buffer.from('editor:').toString('base64'), SECRETS)).toBe(false)
  })

  it('writes into a folder of its own, and never empties another', () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'lighthouse-test-'))
    try {
      // An earlier run's files go; nothing else is there.
      const reports = path.join(folder, 'reports')
      mkdirSync(reports)
      for (const name of [
        'summary.md',
        'summary.json',
        'home.mobile.html',
        'jobs-list.desktop.json',
      ]) {
        writeFileSync(path.join(reports, name), 'an earlier run')
      }
      tool.prepareFolder(reports)
      expect(readdirSync(reports)).toEqual([])
      // A folder that does not exist yet is made.
      tool.prepareFolder(path.join(folder, 'new', 'reports'))
      expect(existsSync(path.join(folder, 'new', 'reports'))).toBe(true)
      // Anything else in it: refused, and left as it is.
      writeFileSync(path.join(reports, 'summary.md'), 'an earlier run')
      writeFileSync(path.join(reports, 'notes.txt'), 'mine')
      mkdirSync(path.join(reports, 'src'))
      expect(() => tool.prepareFolder(reports)).toThrow(/not this script's reports \(.*notes\.txt/)
      expect(readdirSync(reports).sort()).toEqual(['notes.txt', 'src', 'summary.md'])
      // Also from the command line, before anything is read or sent.
      const refused = run(['--origin', 'http://localhost:9', '--out', reports])
      expect(refused.status).toBe(2)
      expect(refused.stderr).toContain("not this script's reports")
      expect(readdirSync(reports).sort()).toEqual(['notes.txt', 'src', 'summary.md'])
      // When a report held the credentials, only the reports go.
      tool.removeReports(reports)
      expect(readdirSync(reports).sort()).toEqual(['notes.txt', 'src'])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('takes the password from standard input only, and says so without one', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'lighthouse-test-'))
    const none = run(['--prod', '--out', out])
    expect(none.status).toBe(2)
    expect(none.stderr).toContain('No password arrived on standard input.')
    // A password that could be spelled another way in a report is refused, and not repeated.
    const odd = run(['--prod', '--out', out], 'pass<word>&"x"\n')
    expect(odd.status).toBe(2)
    expect(odd.stderr).toContain('a character this script does not take')
    expect(odd.stderr + odd.stdout).not.toContain('pass<word>')
    rmSync(out, { recursive: true, force: true })
    // No option and no variable carries a password.
    const option = run(['--prod', '--password', PASSWORD])
    expect(option.status).toBe(2)
    expect(option.stderr).not.toContain(PASSWORD)
    const help = run(['--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).not.toMatch(/--password|PASSWORD/)
  })

  it('needs exactly one site to measure', () => {
    expect(run([]).status).toBe(2)
    expect(run(['--prod', '--origin', 'http://localhost:3000'], PASSWORD).status).toBe(2)
    expect(run(['--local', '--only', 'no such template']).stderr).toContain('No such template')
  })
})
