#!/usr/bin/env node
// Lighthouse against a running site (PLAN §17.2): the lab targets of §17.1 and the byte budgets
// of §17.3 on the main templates, as a phone and as a desktop. Run from the operator's computer,
// never in CI (CI minutes, D46). README.md in this folder has the details.
//
//   ssh gliagora@<server> sudo cat /root/site-password | pnpm lighthouse:prod
//   pnpm lighthouse:local      # the app on BASE_URL (default http://localhost:3000)
//
// The site-wide password (D42) comes on standard input only. It stays in this process's memory
// and goes to the browser as a request header: never an argument, an environment variable or a
// file. Lighthouse copies its settings, extra headers included, into each report, so every
// report is cleaned and then searched for the credentials before it is written
// (`withoutCredentials`), and the written files are searched once more at the end. The browser
// gives the header to every address a page asks for, so in such a run it can find no other host
// than the site's (`--host-resolver-rules`).

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')

/** PLAN §17.1: the lab scores, and the Core Web Vitals "good" in the lab (TBT stands in for INP). */
const TARGETS = { performance: 0.9, accessibility: 1, lcpMs: 2500, cls: 0.1, tbtMs: 200 }
/** PLAN §17.3, counted as tests/e2e/budgets.spec.ts counts them: gzip of what the browser loads. */
const BUDGET_KB = { script: 140, stylesheet: 35, html: 60, font: 120 }
/** Where a map is shown, MapLibre and the map's own code come on top (§17.3, "Map chunk"). */
const MAP_BUDGET_KB = { script: 330, stylesheet: 11 }
const MAPLIBRE = /\/map\/maplibre-gl\//
/**
 * On the home page, the 3D hero's code comes on top where it loads, after the page (§17.3, "Hero
 * chunk", D60); tests/e2e/budgets.spec.ts checks it and the page's own first JavaScript apart.
 */
const HERO_BUDGET_KB = { script: 230 }

/**
 * The main templates. `find` looks a path up on the site first: a job needs an open position,
 * which the server does not have before the launch (measure that template locally, with the fake
 * data); an institution is reached through the redirect to its current address.
 */
const TEMPLATES = [
  { name: 'home', path: '/en/', hero: true },
  { name: 'jobs list', path: '/en/jobs/', scriptKb: 137 },
  { name: 'jobs list (filtered)', path: '/en/jobs/?type=phd', scriptKb: 137 },
  { name: 'jobs list (map)', path: '/en/jobs/?view=map', map: true },
  { name: 'job', find: { on: '/en/jobs/', link: /href="(\/en\/jobs\/[a-z0-9-]+-[a-z0-9]{5}\/)"/ } },
  { name: 'map', path: '/en/map/', map: true },
  {
    name: 'institution',
    find: { redirectFrom: '/en/institutions/california-institute-of-technology-05dxps055/' },
  },
  { name: 'subfield index', path: '/en/subfields/' },
  { name: 'subfield hub', path: '/en/subfields/glia/' },
  { name: 'search', path: '/en/search/?q=glia' },
  { name: 'about', path: '/en/about/' },
  { name: 'privacy policy', path: '/en/legal/privacy/' },
  { name: 'newsletter', path: '/en/newsletter/' },
  { name: 'suggest a listing', path: '/en/suggest/' },
  { name: 'sign in', path: '/en/sign-in/' },
  { name: 'placeholder (events)', path: '/en/events/' },
  { name: 'contact (tr)', path: '/tr/iletisim/' },
]

const FORMS = ['mobile', 'desktop']

const USAGE = `Usage: node tools/lighthouse/run.mjs (--prod | --local | --origin <url>) [options]

  --prod            https://gliagora.com, behind the site-wide password, which is read from
                    standard input (pipe it from the server; never type or store it)
  --local           the app on this computer: BASE_URL, or http://localhost:3000
  --origin <url>    another site without a password
  --user <name>     the user name that goes with the password (default: editor)
  --runs <n>        runs per template and device; the median run counts (default: 3)
  --only <names>    only these templates, by name, separated by commas
  --form <device>   mobile, desktop or both (default: both)
  --throttling <how>  "estimated": Lighthouse's default, a phone on slow 4G estimated from a fast
                    load (the default for --prod and --origin); "applied": the browser is slowed
                    down for real, which takes longer (the default for --local: on this computer
                    every file arrives before the first paint, and the estimate then counts all
                    of them into LCP)
  --out <folder>    where the reports go (default: lighthouse-reports/<prod|local>): a folder of
                    this script's own; one that holds anything else is refused, never emptied
`

function fail(message) {
  console.error(message)
  process.exit(2)
}

function options() {
  let parsed
  try {
    parsed = parseArgs({
      options: {
        prod: { type: 'boolean', default: false },
        local: { type: 'boolean', default: false },
        origin: { type: 'string' },
        user: { type: 'string', default: 'editor' },
        runs: { type: 'string', default: '3' },
        only: { type: 'string' },
        form: { type: 'string', default: 'both' },
        throttling: { type: 'string' },
        out: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    }).values
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`)
  }
  if (parsed.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (parsed.local) parsed.origin ??= process.env.BASE_URL ?? 'http://localhost:3000'
  if (parsed.prod === Boolean(parsed.origin)) fail(USAGE)
  const throttling = parsed.throttling ?? (parsed.local ? 'applied' : 'estimated')
  if (!['estimated', 'applied'].includes(throttling)) {
    fail('--throttling takes estimated or applied.')
  }
  const runs = Number(parsed.runs)
  if (!Number.isInteger(runs) || runs < 1 || runs > 9) fail('--runs takes a number from 1 to 9.')
  const forms = parsed.form === 'both' ? FORMS : FORMS.filter((form) => form === parsed.form)
  if (forms.length === 0) fail('--form takes mobile, desktop or both.')
  const names = parsed.only?.split(',').map((name) => name.trim())
  const unknown = names?.filter((name) => !TEMPLATES.some((one) => one.name === name)) ?? []
  if (unknown.length > 0) {
    fail(
      `No such template: ${unknown.join(', ')}. The templates: ${TEMPLATES.map((one) => one.name).join(', ')}.`,
    )
  }
  let origin
  try {
    origin = new URL(parsed.prod ? 'https://gliagora.com' : parsed.origin).origin
  } catch {
    fail(`Not an address such as http://localhost:3000: "${parsed.origin}".`)
  }
  return {
    prod: parsed.prod,
    origin,
    user: parsed.user,
    runs,
    forms,
    applied: throttling === 'applied',
    templates: names ? TEMPLATES.filter((one) => names.includes(one.name)) : TEMPLATES,
    out: path.resolve(
      parsed.out ?? path.join(ROOT, 'lighthouse-reports', parsed.prod ? 'prod' : 'local'),
    ),
  }
}

/**
 * The password from standard input: one line, never echoed. Read as it arrives: the command that
 * pipes it (ssh) may need a moment before it writes.
 */
async function passwordFromStdin() {
  if (process.stdin.isTTY) {
    fail(
      'The site-wide password must come on standard input, piped from the server:\n\n' +
        '  ssh gliagora@<server> sudo cat /root/site-password | pnpm lighthouse:prod\n\n' +
        'Never type it here, and never put it in a file or a variable (deploy/README.md).',
    )
  }
  let text = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) text += chunk
  const password = text.split(/\r?\n/)[0]
  if (!password) fail('No password arrived on standard input.')
  // Letters, digits and . _ ~ - only (the runbook makes it of letters and digits): such a
  // password is spelled one way wherever it could turn up, so the search of the reports finds it.
  if (!/^[A-Za-z0-9._~-]+$/.test(password)) {
    fail(
      'The password has a character this script does not take (only letters, digits and . _ ~ -), ' +
        'since it could not be sure to find it in a report. Nothing was sent.',
    )
  }
  return password
}

/**
 * Lighthouse is installed in this folder, by its own lockfile, the first time and after its
 * version changed. Standard input is kept away from the installer: it may hold the password.
 */
function installLighthouse() {
  const wanted = JSON.parse(readFileSync(path.join(HERE, 'package.json'), 'utf8')).dependencies
    .lighthouse
  const installed = path.join(HERE, 'node_modules/lighthouse/package.json')
  if (existsSync(installed) && JSON.parse(readFileSync(installed, 'utf8')).version === wanted) {
    return
  }
  console.error(`Installing Lighthouse ${wanted} in tools/lighthouse …`)
  const result = spawnSync('pnpm', ['install', '--frozen-lockfile', '--ignore-workspace'], {
    cwd: HERE,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (result.status !== 0) fail('Lighthouse could not be installed (see above).')
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const slug = (name) => name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
const median = (sorted) => sorted[Math.floor((sorted.length - 1) / 2)]

/** The files of a run: a report per template and device, and the summary. */
const OWN_FILE = /^(?:summary\.(?:json|md)|[A-Za-z0-9-]+\.(?:mobile|desktop)\.(?:html|json))$/

/**
 * Makes the folder ready for a run: an earlier run's files go, so that none can be taken for
 * this run's, and nothing else ever does. A folder that holds anything this script did not write
 * (`--out .`, say) is refused.
 */
export function prepareFolder(folder) {
  const entries = existsSync(folder) ? readdirSync(folder, { withFileTypes: true }) : []
  const others = entries.filter((entry) => !entry.isFile() || !OWN_FILE.test(entry.name))
  if (others.length > 0) {
    throw new Error(
      `${folder} holds files that are not this script's reports (${others
        .slice(0, 3)
        .map((entry) => entry.name)
        .join(', ')}${others.length > 3 ? ', …' : ''}): name a folder of its own with --out.`,
    )
  }
  for (const entry of entries) rmSync(path.join(folder, entry.name))
  mkdirSync(folder, { recursive: true })
}

/** Removes this script's own files from the folder (when one of them held the credentials). */
export function removeReports(folder) {
  for (const name of readdirSync(folder)) {
    if (OWN_FILE.test(name)) rmSync(path.join(folder, name))
  }
}

/**
 * What to search a report for: the password and the header's value, and the start of each, for
 * a copy that was cut short.
 */
export function searchedFor(password, basic) {
  return [
    password,
    basic,
    ...(password.length >= 20 ? [password.slice(0, 16)] : []),
    basic.slice(0, 24),
  ]
}

/** Whether a text holds the password or the header's value, in any spelling they could take. */
export function holdsCredentials(text, secrets) {
  return secrets.some((secret) =>
    [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)].some((spelling) =>
      text.includes(spelling),
    ),
  )
}

/**
 * A report without the credentials, or an error. Lighthouse keeps the extra headers in its
 * settings; they are removed, and the report is then searched for the password and for the
 * header's value. A report that still holds one is never written.
 */
export function withoutCredentials(lhr, secrets) {
  if (lhr.configSettings) lhr.configSettings.extraHeaders = null
  if (holdsCredentials(JSON.stringify(lhr), secrets)) {
    throw new Error('A report holds the credentials: it was not written. Please report this.')
  }
  return lhr
}

/** The written files, searched once more: the names of those that hold the credentials. */
export function filesWithCredentials(folder, secrets) {
  return readdirSync(folder).filter((file) =>
    holdsCredentials(readFileSync(path.join(folder, file), 'utf8'), secrets),
  )
}

/** What this run must never print or write (set once the password is read). */
let secrets = []

async function main() {
  const opts = options()
  // Before anything else: an earlier run's reports go, and a folder that is not ours stops it.
  try {
    prepareFolder(opts.out)
  } catch (error) {
    fail(error.message)
  }
  const password = opts.prod ? await passwordFromStdin() : null
  const basic = password ? Buffer.from(`${opts.user}:${password}`).toString('base64') : null
  const headers = basic ? { Authorization: `Basic ${basic}` } : {}
  secrets = password ? searchedFor(password, basic) : []

  const get = (pathname, init = {}) =>
    fetch(new URL(pathname, opts.origin), { headers, redirect: 'follow', ...init })

  // The site answers, and the password is right, before a browser starts.
  const first = await get('/en/').catch((error) =>
    fail(`${opts.origin} does not answer: ${error.cause?.code ?? error.message}`),
  )
  if (first.status === 401) fail(`The site-wide password was refused for the user "${opts.user}".`)
  if (!first.ok) fail(`${opts.origin}/en/ answers ${first.status}.`)

  installLighthouse()
  const { default: lighthouse, desktopConfig, generateReport } = await import('lighthouse')
  const { chromium } = await import('@playwright/test')

  // The address of each template, looked up where it is not fixed.
  const pages = []
  for (const template of opts.templates) {
    let pathname = template.path
    if (template.find?.link) {
      const html = await (await get(template.find.on)).text()
      pathname = html.match(template.find.link)?.[1]
    } else if (template.find?.redirectFrom) {
      const response = await get(template.find.redirectFrom)
      pathname = response.ok ? new URL(response.url).pathname : undefined
    }
    if (pathname) pages.push({ ...template, path: pathname })
    else console.error(`Not measured: "${template.name}" (nothing to show on ${opts.origin}).`)
  }

  // The Chromium of the end-to-end tests (PLAYWRIGHT_CHROMIUM_EXECUTABLE for another one). With
  // the password, it knows no other host than the site's: Chrome sends the extra header with
  // every request of a page, also to another site, should a page ever ask for one.
  const port = await freePort()
  const browser = await chromium.launch({
    args: [
      `--remote-debugging-port=${port}`,
      ...(basic
        ? [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${new URL(opts.origin).hostname}`]
        : []),
    ],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  })

  /** The gzip size of an address's body, in KB, as tests/e2e/budgets.spec.ts counts it. */
  const sizes = new Map()
  async function kb(url, compress) {
    if (!sizes.has(url)) {
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error(`${new URL(url).pathname} answers ${response.status}`)
      const body = Buffer.from(await response.arrayBuffer())
      sizes.set(url, (compress ? gzipSync(body).length : body.length) / 1024)
    }
    return sizes.get(url)
  }

  const rows = []
  try {
    for (const form of opts.forms) {
      for (const page of pages) {
        const url = new URL(page.path, opts.origin).href
        const runs = []
        for (let run = 0; run < opts.runs; run++) {
          const result = await lighthouse(
            url,
            {
              port,
              logLevel: 'error',
              onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
              ...(opts.applied ? { throttlingMethod: 'devtools' } : {}),
              ...(basic ? { extraHeaders: headers } : {}),
            },
            form === 'desktop' ? desktopConfig : undefined,
          )
          const lhr = withoutCredentials(result.lhr, secrets)
          if (lhr.runtimeError) {
            throw new Error(`${page.name} (${form}): ${lhr.runtimeError.code}`)
          }
          runs.push(lhr)
        }
        // The median run by its performance score stands for the template.
        runs.sort((a, b) => a.categories.performance.score - b.categories.performance.score)
        const lhr = median(runs)
        // The report to read, and its data for a closer look at a number.
        for (const format of ['html', 'json']) {
          writeFileSync(
            path.join(opts.out, `${slug(page.name)}.${form}.${format}`),
            generateReport(lhr, format),
          )
        }

        const value = (id) => lhr.audits[id]?.numericValue ?? null
        const requests = (lhr.audits['network-requests']?.details?.items ?? []).filter((item) =>
          /^https?:/.test(item.url),
        )
        const foreign = [
          ...new Set(
            requests
              .filter((item) => new URL(item.url).origin !== opts.origin)
              .map((item) => new URL(item.url).origin),
          ),
        ]
        const own = [
          ...new Set(
            requests
              .filter((item) => new URL(item.url).origin === opts.origin)
              .map((item) => item.url),
          ),
        ]
        const type = new Map(requests.map((item) => [item.url, item.resourceType]))
        const bytes = { script: 0, stylesheet: 0, font: 0, maplibre: 0 }
        for (const address of own) {
          // MapLibre's worker is not a "script" to the browser, but it is JavaScript.
          const kind = MAPLIBRE.test(address)
            ? address.endsWith('.css')
              ? 'stylesheet'
              : 'script'
            : { Script: 'script', Stylesheet: 'stylesheet', Font: 'font' }[type.get(address)]
          if (!kind) continue
          const size = await kb(address, kind !== 'font')
          bytes[kind] += size
          if (MAPLIBRE.test(address)) bytes.maplibre += size
        }
        const html = await kb(url, true)

        const budget = {
          script:
            (page.scriptKb ?? BUDGET_KB.script) +
            (page.map ? MAP_BUDGET_KB.script : 0) +
            (page.hero ? HERO_BUDGET_KB.script : 0),
          stylesheet: BUDGET_KB.stylesheet + (page.map ? MAP_BUDGET_KB.stylesheet : 0),
        }
        const row = {
          template: page.name,
          path: page.path,
          form,
          performance: lhr.categories.performance.score,
          accessibility: lhr.categories.accessibility.score,
          bestPractices: lhr.categories['best-practices'].score,
          seo: lhr.categories.seo.score,
          performanceRuns: runs.map((one) => one.categories.performance.score),
          lcpMs: value('largest-contentful-paint'),
          cls: value('cumulative-layout-shift'),
          tbtMs: value('total-blocking-time'),
          fcpMs: value('first-contentful-paint'),
          speedIndexMs: value('speed-index'),
          serverMs: value('server-response-time'),
          scriptKb: bytes.script,
          stylesheetKb: bytes.stylesheet,
          htmlKb: html,
          fontKb: bytes.font,
          maplibreKb: bytes.maplibre,
          foreign,
          failed: [],
        }
        const check = (ok, what) => ok || row.failed.push(what)
        check(row.performance >= TARGETS.performance, `performance ${pct(row.performance)}`)
        check(row.accessibility >= TARGETS.accessibility, `accessibility ${pct(row.accessibility)}`)
        check(row.lcpMs <= TARGETS.lcpMs, `LCP ${seconds(row.lcpMs)}`)
        check(row.cls <= TARGETS.cls, `CLS ${row.cls.toFixed(3)}`)
        check(row.tbtMs <= TARGETS.tbtMs, `TBT ${Math.round(row.tbtMs)} ms`)
        check(
          row.scriptKb <= budget.script,
          `JavaScript ${row.scriptKb.toFixed(1)} KB of ${budget.script}`,
        )
        check(
          row.stylesheetKb <= budget.stylesheet,
          `CSS ${row.stylesheetKb.toFixed(1)} KB of ${budget.stylesheet}`,
        )
        check(row.htmlKb <= BUDGET_KB.html, `HTML ${row.htmlKb.toFixed(1)} KB of ${BUDGET_KB.html}`)
        check(
          row.fontKb <= BUDGET_KB.font,
          `fonts ${row.fontKb.toFixed(1)} KB of ${BUDGET_KB.font}`,
        )
        check(foreign.length === 0, `requests to ${foreign.join(', ')}`)
        // The audits behind a score below its target, by name, for the report.
        row.audits = ['performance', 'accessibility', 'best-practices', 'seo'].flatMap((category) =>
          lhr.categories[category].auditRefs
            .filter((ref) => ref.weight > 0 || category !== 'performance')
            .map((ref) => lhr.audits[ref.id])
            .filter((audit) => audit.score !== null && audit.score < 0.9)
            .filter((audit) => audit.scoreDisplayMode !== 'informative')
            .map((audit) => `${category}: ${audit.id}`),
        )
        rows.push(row)
        console.error(line(row))
      }
    }
  } finally {
    await browser.close()
  }

  const summary = {
    origin: opts.origin,
    at: new Date().toISOString(),
    runs: opts.runs,
    applied: opts.applied,
    rows,
  }
  // The summary holds only what this script put there; searched like the reports all the same.
  withoutCredentials(summary, secrets)
  writeFileSync(path.join(opts.out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  writeFileSync(path.join(opts.out, 'summary.md'), markdown(summary))
  const leaked = filesWithCredentials(opts.out, secrets)
  if (leaked.length > 0) {
    removeReports(opts.out)
    fail(
      `Written reports held the credentials (${leaked.join(', ')}): all were deleted. Please report this.`,
    )
  }
  console.log(markdown(summary))
  console.error(`Reports: ${path.relative(process.cwd(), opts.out) || '.'}`)
  process.exit(rows.some((row) => row.failed.length > 0) ? 1 : 0)
}

const pct = (score) => String(Math.round(score * 100))
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`

const line = (row) =>
  `${row.failed.length ? '✗' : '✓'} ${row.form.padEnd(7)} ${row.template.padEnd(22)} ` +
  `performance ${pct(row.performance)}, accessibility ${pct(row.accessibility)}, ` +
  `LCP ${seconds(row.lcpMs)}, CLS ${row.cls.toFixed(3)}, TBT ${Math.round(row.tbtMs)} ms` +
  (row.failed.length ? `  ← ${row.failed.join('; ')}` : '')

function markdown({ origin, at, runs, applied, rows }) {
  const out = [
    `# Lighthouse: ${origin}`,
    '',
    `${at.slice(0, 16).replace('T', ' ')} UTC; the median of ${runs} run${runs === 1 ? '' : 's'} per template and device, ${applied ? 'with the browser slowed down for real' : "estimated from a fast load (Lighthouse's default)"}. Targets (PLAN §17.1, §17.3): performance ≥ ${pct(TARGETS.performance)}, accessibility ${pct(TARGETS.accessibility)}, LCP ≤ ${seconds(TARGETS.lcpMs)}, CLS ≤ ${TARGETS.cls}, TBT ≤ ${TARGETS.tbtMs} ms; JavaScript ≤ ${BUDGET_KB.script} KB (the jobs list 137; the home page's 3D hero ${HERO_BUDGET_KB.script} more, after the page), CSS ≤ ${BUDGET_KB.stylesheet} KB, HTML ≤ ${BUDGET_KB.html} KB, fonts ≤ ${BUDGET_KB.font} KB (gzip), nothing from other sites.`,
  ]
  for (const form of FORMS) {
    const of = rows.filter((row) => row.form === form)
    if (of.length === 0) continue
    out.push(
      '',
      `## ${form === 'mobile' ? 'Phone (slow 4G, a mid-range phone)' : 'Desktop'}`,
      '',
      '| Template | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT | Server | JS KB | CSS KB | HTML KB | Result |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...of.map(
        (row) =>
          `| ${row.template} | ${pct(row.performance)} | ${pct(row.accessibility)} | ${pct(row.bestPractices)} | ${pct(row.seo)} | ${seconds(row.lcpMs)} | ${row.cls.toFixed(3)} | ${Math.round(row.tbtMs)} ms | ${Math.round(row.serverMs)} ms | ${row.scriptKb.toFixed(1)} | ${row.stylesheetKb.toFixed(1)} | ${row.htmlKb.toFixed(1)} | ${row.failed.length ? `**fails:** ${row.failed.join('; ')}` : 'ok'} |`,
      ),
    )
  }
  const notes = rows.filter((row) => row.audits.length > 0)
  if (notes.length > 0) {
    out.push('', '## Audits below 90', '')
    for (const row of notes) out.push(`- ${row.template} (${row.form}): ${row.audits.join(', ')}`)
  }
  return `${out.join('\n')}\n`
}

// 0: every template meets its targets; 1: one does not; 2: the run itself failed (said in a line,
// which never holds the credentials).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const message = String(error?.message ?? error)
    console.error(
      holdsCredentials(message, secrets) ? 'The run failed.' : `The run failed: ${message}`,
    )
    process.exit(2)
  }
}
