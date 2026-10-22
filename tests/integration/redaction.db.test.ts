import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { redactWaitingAgain } from '@/lib/redaction/stored'

import { rows, testPayload, unique } from './helpers'

// Redaction's second round over stored candidates (M7, third round): text stored under the first
// rules (planted here in SQL, since every save redacts with the current rules) is redacted again,
// in the candidate and in its saved versions; decided candidates are left alone. Invented people,
// numbers and addresses only.

let payload: Payload

beforeAll(async () => {
  payload = await testPayload()
})

afterAll(async () => {
  await payload?.destroy()
})

const OLD_TEXT =
  'Contact persons\nAnna Exempelsson, HR partner, 08-524 800 00\nSee doelab.example.org.'
const OLD_TITLE = 'Postdoc, Exemplar/Roe Labs'

async function stored(status: 'new' | 'rejected') {
  const created = await payload.create({
    collection: 'candidates',
    data: {
      kind: 'job',
      status: 'new',
      rawUrl: `https://jobs.example.org/${unique('posting')}`,
      rawTitle: 'Postdoc',
      snippet: 'A postdoc.',
    },
    depth: 0,
  })
  if (status === 'rejected') {
    await payload.update({
      collection: 'candidates',
      id: created.id,
      data: { status: 'rejected', decisionReason: 'not-neuroscience' },
      depth: 0,
    })
  }
  const facts = {
    version: 1,
    readAt: new Date().toISOString(),
    listedOn: { kind: 'page', url: 'https://jobs.example.org/' },
    page: 'read',
    title: { value: OLD_TITLE, from: "the posting's page" },
    deadline: {
      value: { date: '2027-01-15', timeZone: null },
      from: 'the text: "Questions to Anna Exempelsson, HR partner; closing date 15 January 2027"',
    },
  }
  await rows(
    payload,
    sql`UPDATE candidates SET snippet = ${OLD_TEXT}, raw_title = ${OLD_TITLE},
      extracted = ${JSON.stringify(facts)}::jsonb WHERE id = ${created.id}`,
  )
  await rows(
    payload,
    sql`UPDATE _candidates_v SET version_snippet = ${OLD_TEXT}, version_raw_title = ${OLD_TITLE}
      WHERE parent_id = ${created.id}`,
  )
  return created.id
}

const versions = (id: number) =>
  rows<{ version_snippet: string | null; version_raw_title: string | null }>(
    payload,
    sql`SELECT version_snippet, version_raw_title FROM _candidates_v WHERE parent_id = ${id}`,
  )

describe('redactWaitingAgain', () => {
  it('counts on a dry run and changes nothing', async () => {
    const id = await stored('new')
    const result = await redactWaitingAgain(payload, { dryRun: true })
    expect(result.changed).toBeGreaterThanOrEqual(1)
    expect(result.inTexts.name).toBeGreaterThanOrEqual(1)
    expect(result.inTexts.phone).toBeGreaterThanOrEqual(1)
    expect(result.inTexts.link).toBeGreaterThanOrEqual(1)
    expect(result.inTitles.name).toBeGreaterThanOrEqual(2)
    const candidate = await payload.findByID({ collection: 'candidates', id, depth: 0 })
    expect(candidate.snippet).toBe(OLD_TEXT)
  })

  it('redacts the text, title, facts and versions of waiting candidates, once', async () => {
    const waiting = await stored('new')
    const decided = await stored('rejected')
    const result = await redactWaitingAgain(payload)
    expect(result.failed).toBe(0)
    expect(result.versionsChanged).toBeGreaterThanOrEqual(1)

    const candidate = await payload.findByID({ collection: 'candidates', id: waiting, depth: 0 })
    expect(candidate.snippet).toBe('Contact persons\n[name], HR partner, [phone]\nSee [link].')
    expect(candidate.rawTitle).toBe('Postdoc, [name]/[name] Labs')
    const facts = candidate.extracted as {
      title: { value: string }
      deadline: { value: { date: string }; from: string }
      listedOn: { url: string }
    }
    expect(facts.title.value).toBe('Postdoc, [name]/[name] Labs')
    expect(facts.deadline.from).not.toMatch(/Exempelsson/)
    expect(facts.deadline.value.date).toBe('2027-01-15')
    expect(facts.listedOn.url).toBe('https://jobs.example.org/')
    for (const version of await versions(waiting)) {
      expect(version.version_snippet ?? '').not.toMatch(/Exempelsson|08-524/)
      expect(version.version_raw_title ?? '').not.toMatch(/Exemplar/)
    }

    // A decided candidate keeps its text until the retention task deletes it.
    const kept = await payload.findByID({ collection: 'candidates', id: decided, depth: 0 })
    expect(kept.snippet).toBe(OLD_TEXT)

    const second = await redactWaitingAgain(payload)
    const again = await payload.findByID({ collection: 'candidates', id: waiting, depth: 0 })
    expect(again.snippet).toBe(candidate.snippet)
    expect(second.failed).toBe(0)
  })
})
