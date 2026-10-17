import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { checkLinks } from '@/jobs/maintenance/checkLinks'
import { monitorSources } from '@/jobs/maintenance/monitorSources'
import { purgeSourcePostings, purgeSourceRuns } from '@/jobs/maintenance/purgeRetention'
import { type Fetcher, FetchProblem } from '@/lib/monitors/http'
import { monitorReport } from '@/lib/monitors/report'
import { forgetTaxonomy } from '@/lib/tags/terms'

import { institution, job, rows, testPayload, unique } from './helpers'

// The monitors (M7, D52) against invented pages served by a fake fetcher: no request leaves the
// computer. Each test makes its own source and runs only it.

let payload: Payload
let institutionId: number

beforeAll(async () => {
  payload = await testPayload()
  forgetTaxonomy()
  institutionId = Number((await institution(payload, { country: 'GB' })).id)
})

afterAll(async () => {
  await payload?.destroy()
})

/** A fetcher that serves `pages` (address → HTML, or a status), and robots.txt for every host. */
function fakeWeb(
  pages: Record<string, string | number>,
  robots = 'User-agent: *\nDisallow: /private/\n',
) {
  const asked: string[] = []
  const fetcher: Fetcher = {
    get: async (url, options) => {
      asked.push(url)
      const parsed = new URL(url)
      if (parsed.pathname === '/robots.txt') {
        if (robots === '') throw new FetchProblem('status', 404)
        return { url, status: 200, contentType: 'text/plain', text: robots, tdmReserved: false }
      }
      if (options.allow && !(await options.allow(parsed))) throw new FetchProblem('refused')
      const page = pages[url]
      if (page === undefined) throw new FetchProblem('status', 404)
      if (typeof page === 'number') throw new FetchProblem('status', page)
      return {
        url,
        status: 200,
        contentType: 'text/html; charset=utf-8',
        text: page,
        tdmReserved: false,
      }
    },
    slowDown: () => {},
  }
  return { fetcher, asked }
}

const posting = (title: string, body: string, jsonLd?: object) =>
  `<html><head><title>${title} | Example</title>${
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''
  }</head><body><nav>Jobs Contact</nav><main><h1>${title}</h1>${body}</main></body></html>`

async function pageSource(host: string, fields: Record<string, unknown> = {}) {
  return payload.create({
    collection: 'sources',
    data: {
      name: unique('Fake source'),
      kind: 'page',
      institution: institutionId,
      url: `https://${host}/jobs/`,
      postingPattern: `^https://${host.replace(/\./g, '\\.')}/jobs/\\d+$`,
      termsAutomation: 'not-stated',
      schedule: 'daily',
      ...fields,
    } as never,
    depth: 0,
  })
}

const now = new Date('2026-10-16T04:15:00Z')

describe('monitorSources', () => {
  it('makes candidates of new neuroscience postings, and skips the others with a reason', async () => {
    const host = `${unique('jobs')}.example.org`
    const at = (n: number) => `https://${host}/jobs/${n}`
    const existing = await job(payload, institutionId, { originalUrl: at(6) })
    const list = `<html><body><main>${[1, 2, 3, 4, 5, 6, 7]
      .map((n) => `<a href="/jobs/${n}">Posting ${n}</a>`)
      .join('')}<a href="/about/">About</a></main></body></html>`
    const { fetcher } = fakeWeb({
      [`https://${host}/jobs/`]: list,
      [at(1)]: posting(
        'PhD position: astrocytes and synaptic plasticity',
        '<p>We study glial cells in mouse hippocampus with two-photon imaging.</p><p>For questions, please contact Prof. Jane Doe (jane.doe@example.org, +44 20 7946 0000).</p>',
        {
          '@type': 'JobPosting',
          title: 'PhD position: astrocytes and synaptic plasticity',
          validThrough: '2026-12-01',
        },
      ),
      [at(2)]: posting(
        'Finance officer',
        '<p>Budgets and invoices. Closing date: 1 December 2026.</p>',
      ),
      [at(3)]: posting(
        'Postdoc in cortical circuits',
        '<p>Neural circuits of the cortex. Closing date: 1 October 2026.</p>',
      ),
      // 4 answers 404: the posting is gone.
      [at(5)]: 503,
      // 6 is already a job; 7 is a postdoc open until filled.
      [at(7)]: posting(
        'Postdoctoral researcher in neuroimaging',
        '<p>fMRI of the human brain. Open until the position is filled.</p>',
      ),
    })
    const source = await pageSource(host)
    const { results } = await monitorSources(payload, now, { only: [source.id], fetcher })
    expect(results[0]).toMatchObject({
      outcome: 'ok',
      counts: {
        listed: 7,
        new: 7,
        candidates: 2,
        notNeuroscience: 1,
        closed: 2,
        duplicates: 1,
        failedPages: 1,
      },
    })

    const { docs } = await payload.find({
      collection: 'candidates',
      where: { source: { equals: source.id } },
      sort: 'id',
      depth: 0,
    })
    expect(docs.map((c) => c.rawUrl)).toEqual([at(1), at(7)])
    const [first, second] = docs
    expect(first).toMatchObject({ status: 'new', kind: 'job', institution: institutionId })
    expect(first?.snippet).toContain('Prof. [name] ([email], [phone])')
    expect(first?.snippet).not.toMatch(/jane|doe|7946/i)
    expect(first?.extracted).toMatchObject({
      page: 'read',
      deadline: {
        value: { date: '2026-12-01', timeZone: null },
        from: expect.stringContaining('validThrough'),
      },
    })
    expect(first?.tagSuggestions).toMatchObject({
      positionType: { slug: 'phd' },
      subfields: expect.arrayContaining([expect.objectContaining({ slug: 'glia' })]),
    })
    expect(second?.extracted).toMatchObject({ openEnded: { value: 'until-filled' } })

    const seen = await rows<{ canonical_url: string; outcome: string }>(
      payload,
      sql`SELECT canonical_url, outcome::text FROM source_postings WHERE source_id = ${source.id} ORDER BY canonical_url`,
    )
    expect(Object.fromEntries(seen.map((r) => [r.canonical_url.slice(-1), r.outcome]))).toEqual({
      '1': 'candidate',
      '2': 'not-neuroscience',
      '3': 'closed',
      '4': 'closed',
      '6': 'duplicate',
      '7': 'candidate',
    })
    const after = await payload.findByID({ collection: 'sources', id: source.id, depth: 0 })
    expect(after).toMatchObject({
      consecutiveFailures: 0,
      robotsAllowed: true,
      lastRunFound: 2,
      candidatesFound: 2,
      needsAttention: false,
    })
    expect(after.lastSuccessAt).toBe(now.toISOString())
    void existing
  })

  it('reads only what is new on the next run, and the page that failed again', async () => {
    const host = `${unique('jobs')}.example.org`
    const page = (n: number[]) =>
      `<html><body>${n.map((i) => `<a href="/jobs/${i}">Posting ${i}</a>`).join('')}</body></html>`
    const neuro = (n: number) =>
      posting(`Postdoc ${n} in systems neuroscience`, '<p>Neural circuits in mice.</p>')
    const web = fakeWeb({
      [`https://${host}/jobs/`]: page([1]),
      [`https://${host}/jobs/1`]: neuro(1),
    })
    const source = await pageSource(host)
    await monitorSources(payload, now, { only: [source.id], fetcher: web.fetcher })

    const later = new Date(now.getTime() + 86_400_000)
    const again = fakeWeb({
      [`https://${host}/jobs/`]: page([1, 2]),
      [`https://${host}/jobs/1`]: neuro(1),
      [`https://${host}/jobs/2`]: neuro(2),
    })
    const { results } = await monitorSources(payload, later, {
      only: [source.id],
      fetcher: again.fetcher,
    })
    expect(results[0]?.counts).toMatchObject({ listed: 2, new: 1, candidates: 1 })
    expect(again.asked).not.toContain(`https://${host}/jobs/1`)
    const [kept] = await rows<{ last_seen_at: Date }>(
      payload,
      sql`SELECT last_seen_at FROM source_postings WHERE source_id = ${source.id} AND canonical_url LIKE ${'%/jobs/1'}`,
    )
    expect(new Date(kept!.last_seen_at).toISOString()).toBe(later.toISOString())
  })

  it('keeps every posting of a source whose postings are all in neuroscience', async () => {
    const host = `${unique('jobs')}.example.org`
    const web = fakeWeb({
      [`https://${host}/jobs/`]: '<a href="/jobs/1">Research assistant</a>',
      [`https://${host}/jobs/1`]: posting('Research assistant', '<p>Help run our experiments.</p>'),
    })
    const source = await pageSource(host, { allNeuroscience: true })
    const { results } = await monitorSources(payload, now, {
      only: [source.id],
      fetcher: web.fetcher,
    })
    expect(results[0]?.counts.candidates).toBe(1)
  })

  it('reads no list that robots.txt disallows, and flags the source', async () => {
    const host = `${unique('jobs')}.example.org`
    const web = fakeWeb(
      { [`https://${host}/jobs/`]: '<a href="/jobs/1">x</a>' },
      'User-agent: Gliagora-Monitor\nDisallow: /jobs/\n',
    )
    const source = await pageSource(host)
    const { results } = await monitorSources(payload, now, {
      only: [source.id],
      fetcher: web.fetcher,
    })
    expect(results[0]?.outcome).toBe('refused')
    expect(web.asked).toEqual([`https://${host}/robots.txt`])
    const after = await payload.findByID({ collection: 'sources', id: source.id, depth: 0 })
    expect(after).toMatchObject({ robotsAllowed: false, needsAttention: true })
  })

  it('counts failed runs, flags the source at the third and goes on with the others', async () => {
    const broken = `${unique('jobs')}.example.org`
    const fine = `${unique('jobs')}.example.org`
    const web = fakeWeb({
      [`https://${broken}/jobs/`]: 503,
      [`https://${fine}/jobs/`]: '<p>No vacancies</p>',
    })
    const failing = await pageSource(broken)
    const working = await pageSource(fine)
    for (let day = 0; day < 3; day++) {
      const { results } = await monitorSources(
        payload,
        new Date(now.getTime() + day * 86_400_000),
        {
          only: [failing.id, working.id],
          fetcher: web.fetcher,
        },
      )
      expect(results.map((r) => r.outcome)).toEqual(['failed', 'ok'])
    }
    const after = await payload.findByID({ collection: 'sources', id: failing.id, depth: 0 })
    expect(after).toMatchObject({
      consecutiveFailures: 3,
      lastError: 'the list: status 503',
      needsAttention: true,
      attentionReason: 'its last 3 runs failed',
    })
  })

  it('notices when the terms page changed since an editor read it', async () => {
    const host = `${unique('jobs')}.example.org`
    const terms = `https://${host}/terms/`
    const source = await pageSource(host, { termsUrl: terms })
    const first = fakeWeb({
      [`https://${host}/jobs/`]: '<p>None</p>',
      [terms]: '<main><p>Use this site fairly.</p></main>',
    })
    await monitorSources(payload, now, { only: [source.id], fetcher: first.fetcher })
    let after = await payload.findByID({ collection: 'sources', id: source.id, depth: 0 })
    expect(after.termsChangedAt).toBeFalsy()
    expect(after.termsHash).toBe(after.termsReviewedHash)

    const week = new Date(now.getTime() + 8 * 86_400_000)
    const changed = fakeWeb({
      [`https://${host}/jobs/`]: '<p>None</p>',
      [terms]: '<main><p>Automated access to this site is not permitted.</p></main>',
    })
    await monitorSources(payload, week, { only: [source.id], fetcher: changed.fetcher })
    after = await payload.findByID({ collection: 'sources', id: source.id, depth: 0 })
    expect(after.termsChangedAt).toBe(week.toISOString())
    expect(after).toMatchObject({ needsAttention: true })
  })

  it('forgets postings its source has not listed for 180 days', async () => {
    const host = `${unique('jobs')}.example.org`
    const source = await pageSource(host)
    const web = fakeWeb({
      [`https://${host}/jobs/`]: '<a href="/jobs/1">Finance officer</a><a href="/jobs/2">Clerk</a>',
      [`https://${host}/jobs/1`]: posting('Finance officer', '<p>Budgets.</p>'),
      [`https://${host}/jobs/2`]: posting('Clerk', '<p>Files.</p>'),
    })
    await monitorSources(payload, now, { only: [source.id], fetcher: web.fetcher })
    await rows(
      payload,
      sql`UPDATE source_postings SET last_seen_at = ${new Date(now.getTime() - 181 * 86_400_000).toISOString()}
        WHERE source_id = ${source.id} AND canonical_url LIKE ${'%/jobs/1'} RETURNING id`,
    )
    expect(await purgeSourcePostings(payload, now)).toBeGreaterThanOrEqual(1)
    const left = await rows<{ canonical_url: string }>(
      payload,
      sql`SELECT canonical_url FROM source_postings WHERE source_id = ${source.id}`,
    )
    expect(left.map((r) => r.canonical_url.slice(-1))).toEqual(['2'])
  })
})

describe('the record of each run and the report (M7, second round)', () => {
  it('records each run with its counts, also the postings left for the next run', async () => {
    const host = `${unique('jobs')}.example.org`
    const list = `<html><body>${[1, 2, 3, 4, 5]
      .map((n) => `<a href="/jobs/${n}">Posting ${n}</a>`)
      .join('')}</body></html>`
    const pages: Record<string, string | number> = { [`https://${host}/jobs/`]: list }
    for (const n of [1, 2, 3, 4, 5]) {
      pages[`https://${host}/jobs/${n}`] = posting(
        `Postdoc ${n} in neuroscience`,
        '<p>Neurons.</p>',
      )
    }
    const source = await pageSource(host)
    const { results } = await monitorSources(payload, now, {
      only: [source.id],
      fetcher: fakeWeb(pages).fetcher,
      maxReads: 2,
    })
    expect(results[0]?.counts).toMatchObject({ listed: 5, new: 5, read: 2, capped: 3 })
    const { docs } = await payload.find({
      collection: 'source-runs',
      where: { source: { equals: source.id } },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({
      ranAt: now.toISOString(),
      byHand: true,
      outcome: 'ok',
      listed: 5,
      new: 5,
      read: 2,
      candidates: 2,
      capped: 3,
    })
  })

  it('reports runs, failures, postings and candidates without their text or addresses', async () => {
    const host = `${unique('jobs')}.example.org`
    const at = (n: number) => `https://${host}/jobs/${n}`
    const list = `<html><body>${[1, 2, 3]
      .map((n) => `<a href="/jobs/${n}">Posting ${n}</a>`)
      .join('')}</body></html>`
    const first = fakeWeb({
      [`https://${host}/jobs/`]: list,
      [at(1)]: posting(
        'Postdoc in the Jane Doe Lab: cortical circuits',
        '<p>We record neurons in the visual cortex. Closing date: 1 December 2026.</p><p>Contact Dr. John Roe, john.roe@example.org.</p>',
      ),
      [at(2)]: posting('Finance officer', '<p>Budgets and invoices.</p>'),
      [at(3)]: posting(
        'Research assistant in Clinical Neuroscience',
        '<p>Open until filled. Electrophysiology of the hippocampus.</p>',
      ),
    })
    const source = await pageSource(host)
    await monitorSources(payload, now, { only: [source.id], fetcher: first.fetcher })
    const failing = fakeWeb({ [`https://${host}/jobs/`]: 503 })
    await monitorSources(payload, new Date(now.getTime() + 86_400_000), {
      only: [source.id],
      fetcher: failing.fetcher,
    })
    const { docs } = await payload.find({
      collection: 'candidates',
      where: { source: { equals: source.id } },
      sort: 'id',
      depth: 0,
    })
    await payload.update({
      collection: 'candidates',
      id: docs[1]!.id,
      data: { status: 'rejected', decisionReason: 'not-neuroscience' },
      depth: 0,
    })

    const report = await monitorReport(payload, now, { source: source.id })
    expect(report.sources).toHaveLength(1)
    expect(report.sources?.[0]).toMatchObject({
      id: source.id,
      kind: 'page',
      runs: { total: 2, ok: 1, failed: 1, byHand: 2 },
      failures: { 'the list: status 503': 1 },
      found: { listed: 3, new: 3, read: 3, candidates: 2, notNeuroscience: 1, capped: 0 },
      postings: { candidate: 2, notNeuroscience: 1 },
      candidates: { new: 1, rejected: 1 },
      rejections: { 'not-neuroscience': 1 },
    })
    expect(report.candidates).toEqual([
      expect.objectContaining({
        id: docs[0]!.id,
        source: source.id,
        title: 'Postdoc in the [name] Lab: cortical circuits',
        status: 'new',
        reason: null,
        deadline: '2026-12-01',
        openEnded: null,
        type: 'postdoc',
      }),
      expect.objectContaining({
        id: docs[1]!.id,
        status: 'rejected',
        reason: 'not-neuroscience',
        deadline: null,
        openEnded: 'until-filled',
      }),
    ])
    expect(report.skipped).toEqual([
      expect.objectContaining({
        source: source.id,
        title: 'Finance officer',
        outcome: 'not-neuroscience',
      }),
    ])
    const text = JSON.stringify(report)
    expect(text).not.toMatch(/jane|doe|roe|example\.org|visual cortex|budgets/i)

    const onlySkipped = await monitorReport(payload, now, { source: source.id, parts: ['skipped'] })
    expect(Object.keys(onlySkipped).sort()).toEqual(['generatedAt', 'skipped'])
  })

  it('rejects several candidates at once with one reason, as "Edit many" in the admin does', async () => {
    const host = `${unique('jobs')}.example.org`
    const pages: Record<string, string> = {
      [`https://${host}/jobs/`]: [1, 2, 3]
        .map((n) => `<a href="/jobs/${n}">Posting ${n}</a>`)
        .join(''),
    }
    for (const n of [1, 2, 3]) {
      pages[`https://${host}/jobs/${n}`] = posting(
        `Postdoc ${n} in neuroscience`,
        '<p>Neurons.</p>',
      )
    }
    const source = await pageSource(host)
    await monitorSources(payload, now, { only: [source.id], fetcher: fakeWeb(pages).fetcher })
    const { docs } = await payload.find({
      collection: 'candidates',
      where: { source: { equals: source.id } },
      sort: 'id',
      depth: 0,
    })
    await payload.update({
      collection: 'candidates',
      id: docs[2]!.id,
      data: { status: 'triaged' },
      depth: 0,
    })
    const bulk = await payload.update({
      collection: 'candidates',
      where: { id: { in: docs.map((doc) => doc.id) } },
      data: { status: 'rejected', decisionReason: 'not-neuroscience' },
      depth: 0,
    })
    expect(bulk.errors).toEqual([])
    expect(
      bulk.docs.map((doc) => [doc.status, doc.decisionReason, Boolean(doc.decidedAt)]),
    ).toEqual([
      ['rejected', 'not-neuroscience', true],
      ['rejected', 'not-neuroscience', true],
      ['rejected', 'not-neuroscience', true],
    ])
    // Without a reason, every one is refused and none changes.
    const reopened = await payload.update({
      collection: 'candidates',
      where: { id: { in: docs.map((doc) => doc.id) } },
      data: { status: 'triaged' },
      depth: 0,
    })
    expect(reopened.errors).toEqual([])
    const refused = await payload.update({
      collection: 'candidates',
      where: { id: { in: docs.map((doc) => doc.id) } },
      data: { status: 'rejected' },
      depth: 0,
    })
    expect(refused.docs).toEqual([])
    expect(refused.errors).toHaveLength(3)
    const report = await monitorReport(payload, now, { source: source.id, parts: ['sources'] })
    expect(report.sources?.[0]?.candidates).toEqual({ triaged: 3 })
  })

  it('forgets the records of runs after a year, and with their source', async () => {
    const host = `${unique('jobs')}.example.org`
    const source = await pageSource(host)
    const web = fakeWeb({ [`https://${host}/jobs/`]: '<p>None</p>' })
    await monitorSources(payload, now, { only: [source.id], fetcher: web.fetcher })
    const later = new Date(now.getTime() + 2 * 86_400_000)
    await monitorSources(payload, later, { only: [source.id], fetcher: web.fetcher })
    const count = async () =>
      (
        await rows<{ n: number }>(
          payload,
          sql`SELECT count(*)::int AS n FROM source_runs WHERE source_id = ${source.id}`,
        )
      )[0]!.n
    expect(await count()).toBe(2)
    expect(
      await purgeSourceRuns(payload, new Date(now.getTime() + 366 * 86_400_000)),
    ).toBeGreaterThanOrEqual(1)
    expect(await count()).toBe(1)
    await payload.delete({ collection: 'sources', id: source.id })
    expect(await count()).toBe(0)
  })
})

describe('checkLinks', () => {
  it("records each published job's page, and clears an editor's dismissal when the finding changes", async () => {
    const host = `${unique('jobs')}.example.org`
    const open = await job(payload, institutionId, { originalUrl: `https://${host}/jobs/open` })
    const filled = await job(payload, institutionId, { originalUrl: `https://${host}/jobs/filled` })
    const gone = await job(payload, institutionId, { originalUrl: `https://${host}/jobs/gone` })
    await rows(
      payload,
      sql`UPDATE jobs SET link_warning_dismissed = true WHERE id = ${gone.id} RETURNING id`,
    )
    const { fetcher } = fakeWeb({
      [`https://${host}/jobs/open`]: posting('Postdoc', '<p>Apply by 1 December 2026.</p>'),
      [`https://${host}/jobs/filled`]: posting('Postdoc', '<p>This position has been filled.</p>'),
    })
    await checkLinks(payload, now, { fetcher })
    const state = await rows<{
      id: number
      link_status: string
      link_says_closed: boolean
      link_warning_dismissed: boolean
      last_checked_at: Date
    }>(
      payload,
      sql`SELECT id, link_status::text, link_says_closed, link_warning_dismissed, last_checked_at FROM jobs
        WHERE id IN (${open.id}, ${filled.id}, ${gone.id}) ORDER BY id`,
    )
    expect(state.map((r) => [r.link_status, r.link_says_closed, r.link_warning_dismissed])).toEqual(
      [
        ['ok', false, false],
        ['ok', true, false],
        ['gone', false, false],
      ],
    )
    expect(new Date(state[0]!.last_checked_at).toISOString()).toBe(now.toISOString())
  })
})
