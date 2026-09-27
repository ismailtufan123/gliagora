import type { Field } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SHORT_ID_PATTERN } from '@/lib/short-id'

import { FAKE_DATA, Jobs, duplicateMessage, isFakeData, jobLocation } from './Jobs'

type Validate = (value: unknown, options: Record<string, unknown>) => unknown
type DataField = Field & {
  name: string
  validate?: Validate
  access?: { update?: () => boolean }
  admin?: { condition?: (data: unknown, siblingData: unknown, ctx: unknown) => boolean }
}

// Every field that holds data, with its path (groups add a prefix, rows and collapsibles do not).
function dataFields(fields: Field[], prefix = ''): { path: string; field: DataField }[] {
  return fields.flatMap((f) => {
    if (f.type === 'row' || f.type === 'collapsible') return dataFields(f.fields, prefix)
    if (f.type === 'group' && 'name' in f) return dataFields(f.fields, `${prefix}${f.name}.`)
    return 'name' in f ? [{ path: `${prefix}${f.name}`, field: f as DataField }] : []
  })
}

const FIELDS = dataFields(Jobs.fields)
const field = (path: string) => FIELDS.find((f) => f.path === path)!.field
const get = (data: unknown, path: string) =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], data)

type Payload = {
  find?: ReturnType<typeof vi.fn>
  findByID?: ReturnType<typeof vi.fn>
  count?: ReturnType<typeof vi.fn>
}
const request = (payload: Payload = {}) => ({
  t: (key: string) => key,
  payload: {
    collections: {},
    db: { defaultIDType: 'number' },
    findByID: vi.fn(async () => null),
    ...payload,
  },
  // Payload's own relationship check looks the chosen IDs up through this; all of them exist.
  payloadDataLoader: {
    find: async ({ where }: { where: { and: [{ id: { in: number[] } }] } }) => ({
      docs: where.and[0].id.in.map((id) => ({ id })),
    }),
  },
  context: {},
})

const TERMS = [
  { id: 3, vocabulary: 'position-type', isActive: true, label: 'PhD' },
  { id: 11, vocabulary: 'subfield', isActive: true, label: 'Glia' },
  { id: 12, vocabulary: 'subfield', isActive: false, label: 'Old subfield' },
]

/** `payload.find` for these tests: the terms above, and `jobs` for every query on jobs. */
const finder = (jobs: Record<string, unknown>[] = []) =>
  vi.fn(
    async ({ collection, where }: { collection: string; where: { id?: { in: number[] } } }) => ({
      docs: collection === 'terms' ? TERMS.filter((term) => where.id?.in.includes(term.id)) : jobs,
    }),
  )

/** Runs the field validations as Payload does on save, and returns the messages by path. */
async function problems(
  data: Record<string, unknown>,
  { event = 'onChange', previous = {}, id, req = request() } = {} as {
    event?: 'onChange' | 'submit'
    previous?: Record<string, unknown>
    id?: number
    req?: ReturnType<typeof request>
  },
) {
  const result: Record<string, string> = {}
  for (const { path, field: f } of FIELDS) {
    if (!f.validate) continue
    if (f.admin?.condition && !f.admin.condition(data, data, {})) continue
    const message = await f.validate(get(data, path), {
      ...f,
      data,
      siblingData: data,
      event,
      id,
      req,
      previousValue: get(previous, path),
    })
    if (message !== true) result[path] = message as string
  }
  return result
}

const [restoreShortId, prepare] = Jobs.hooks?.beforeValidate ?? []
const [keepPublished] = Jobs.hooks?.beforeDelete ?? []

const run = (
  data: Record<string, unknown>,
  {
    operation = 'create',
    originalDoc,
    context = {},
    payload = {},
  }: {
    operation?: 'create' | 'update'
    originalDoc?: Record<string, unknown>
    context?: Record<string | symbol, unknown>
    payload?: Payload
  } = {},
) =>
  prepare?.({
    data,
    operation,
    originalDoc,
    context,
    req: request({
      count: vi.fn(async () => ({ totalDocs: 0 })),
      findByID: vi.fn(async () => ({ id: 7, city: 'Stockholm', country: 'SE' })),
      ...payload,
    }),
  } as never) as Promise<Record<string, unknown>>

// A job with every fact needed for review and publication.
const complete = (overrides: Record<string, unknown> = {}) => ({
  title: 'PhD position in glial calcium signalling',
  institution: 7,
  status: 'published',
  positionType: 3,
  subfields: [11],
  deadlineKind: 'fixed',
  deadlineDate: '2099-01-15T12:00:00.000Z',
  summary: 'A four-year doctoral project on how astrocytes shape cortical activity.',
  originalUrl: 'https://www.example.org/jobs/123',
  verifiedAt: '2026-09-20T12:00:00.000Z',
  publishedAt: '2026-09-21T10:00:00.000Z',
  checks: {
    employerOrigin: true,
    positionOpen: true,
    deadlineConfirmed: true,
    ownWords: true,
    noPersonalContacts: true,
  },
  ...overrides,
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('Jobs: values filled in on save', () => {
  it('makes the slug, short ID, title fingerprint and canonical address', async () => {
    const data = await run({
      title: '  PhD Position – Glia & Memory (m/f/d) ',
      originalUrl: ' https://Example.org/jobs/7/?utm_source=list ',
    })
    expect(data.title).toBe('PhD Position – Glia & Memory (m/f/d)')
    expect(data.slug).toBe('phd-position-glia-and-memory-m-f-d')
    expect(data.shortId).toMatch(SHORT_ID_PATTERN)
    expect(data.fingerprint).toBe('phd position glia memory m f d')
    expect(data.originalUrl).toBe('https://Example.org/jobs/7/?utm_source=list')
    expect(data.canonicalUrl).toBe('https://example.org/jobs/7')
  })

  it('tries another short ID when one is taken', async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce({ totalDocs: 1 })
      .mockResolvedValue({ totalDocs: 0 })
    const data = await run({ title: 'Postdoc' }, { payload: { count } })
    expect(count).toHaveBeenCalledTimes(2)
    expect(data.shortId).toMatch(SHORT_ID_PATTERN)
  })

  it('keeps a given short ID (the fixed fake jobs) and never makes one on update', async () => {
    expect((await run({ title: 'X', shortId: 'test1' })).shortId).toBe('test1')
    const updated = await run(
      { title: 'X' },
      { operation: 'update', originalDoc: { shortId: 'k3f9a', status: 'draft' } },
    )
    expect(updated.shortId).toBeUndefined()
  })

  it('keeps the short ID when a version is restored without it', () => {
    const data = restoreShortId?.({
      data: { title: 'Old title' },
      operation: 'update',
      originalDoc: { shortId: 'k3f9a' },
      req: {},
    } as never)
    expect(data).toMatchObject({ shortId: 'k3f9a' })
  })

  it('stores the deadline as a calendar day and computes when it ends', async () => {
    // A day picked in a browser in UTC+1 arrives at 11:00 UTC.
    const aoe = await run({ title: 'X', deadlineDate: '2026-12-01T11:00:00.000Z' })
    expect(aoe.deadlineDate).toBe('2026-12-01T12:00:00.000Z')
    expect(aoe.deadlineTz).toBeNull()
    expect(aoe.deadlineAt).toBe('2026-12-02T12:00:00.000Z')
    const berlin = await run({
      title: 'X',
      deadlineDate: '2026-12-01',
      deadlineTz: 'Europe/Berlin',
    })
    expect(berlin.deadlineAt).toBe('2026-12-01T23:00:00.000Z')
  })

  it('clears the deadline day and time zone for rolling and until-filled positions', async () => {
    const data = await run({
      title: 'X',
      deadlineKind: 'rolling',
      deadlineDate: '2026-12-01T12:00:00.000Z',
      deadlineTz: 'Europe/Berlin',
    })
    expect(data).toMatchObject({ deadlineDate: null, deadlineTz: null, deadlineAt: null })
  })

  it('stores the day of verification as a calendar day', async () => {
    const data = await run({ title: 'X', verifiedAt: '2026-09-20T13:00:00.000Z' })
    expect(data.verifiedAt).toBe('2026-09-20T12:00:00.000Z')
  })

  it("shows the institution's location unless the job has its own", async () => {
    const findByID = vi.fn(async () => ({ id: 7, city: 'Stockholm', country: 'SE' }))
    expect(await run({ title: 'X', institution: 7 }, { payload: { findByID } })).toMatchObject({
      country: 'SE',
      city: 'Stockholm',
    })
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'institutions' }))
    const away = await run(
      { title: 'X', institution: 7, locationOverride: { city: 'Geneva', country: 'CH' } },
      { payload: { findByID } },
    )
    expect(away).toMatchObject({ country: 'CH', city: 'Geneva' })
  })

  it('works out the location from an override with only a city or only a country', () => {
    const institution = { city: 'Stockholm', country: 'SE' }
    expect(jobLocation({ city: 'Solna' }, institution)).toEqual({ country: 'SE', city: 'Solna' })
    expect(jobLocation({ country: 'NO' }, institution)).toEqual({ country: 'NO', city: null })
    expect(jobLocation({ country: { id: 'SE' } }, institution)).toEqual({
      country: 'SE',
      city: 'Stockholm',
    })
    expect(jobLocation(null, null)).toEqual({ country: null, city: null })
  })
})

describe('Jobs: status timestamps', () => {
  it('records the first publication, also for code that bypasses access control', async () => {
    const data = await run(
      { title: 'X', status: 'published', publishedAt: '2020-01-01T00:00:00.000Z' },
      { operation: 'update', originalDoc: { status: 'in_review', publishedAt: null } },
    )
    expect(Date.now() - Date.parse(data.publishedAt as string)).toBeLessThan(5000)
    expect(data.expiredAt).toBeNull()
  })

  it('keeps the first publication and records expiry and withdrawal', async () => {
    const originalDoc = { status: 'published', publishedAt: '2026-09-01T08:00:00.000Z' }
    const expired = await run(
      { title: 'X', status: 'expired' },
      { operation: 'update', originalDoc },
    )
    expect(expired.publishedAt).toBe('2026-09-01T08:00:00.000Z')
    expect(expired.expiredAt).toEqual(expect.any(String))
    const withdrawn = await run(
      { title: 'X', status: 'withdrawn' },
      { operation: 'update', originalDoc },
    )
    expect(withdrawn.withdrawnAt).toEqual(expect.any(String))
  })

  it('takes timestamps from the data only for the fake data script', async () => {
    const data = {
      title: 'X',
      status: 'expired',
      publishedAt: '2026-08-01T08:00:00.000Z',
      expiredAt: '2026-09-01T08:00:00.000Z',
    }
    const fake = await run({ ...data }, { context: { fakeData: FAKE_DATA } })
    expect(fake).toMatchObject({
      publishedAt: '2026-08-01T08:00:00.000Z',
      expiredAt: '2026-09-01T08:00:00.000Z',
    })
    const other = await run({ ...data }, { context: { fakeData: 'yes' } })
    expect(other.publishedAt).toBeNull()
  })

  it('clears "position still open" and "deadline confirmed" when a published job closes', async () => {
    for (const status of ['expired', 'withdrawn']) {
      const closed = await run({ status }, { operation: 'update', originalDoc: complete() })
      expect(closed.checks).toEqual({
        employerOrigin: true,
        positionOpen: false,
        deadlineConfirmed: false,
        ownWords: true,
        noPersonalContacts: true,
      })
      // Publishing it again needs both ticked again.
      const again = await problems({ ...complete(), ...closed, status: 'published' })
      expect(Object.keys(again).sort()).toEqual(['checks.deadlineConfirmed', 'checks.positionOpen'])
    }
    const corrected = await run(
      { summary: 'New.' },
      { operation: 'update', originalDoc: complete() },
    )
    expect(corrected.checks).toBeUndefined()
  })

  it('ignores the fake data flag on the production server', () => {
    expect(isFakeData({ fakeData: FAKE_DATA })).toBe(true)
    vi.stubEnv('PAYLOAD_JOBS_AUTORUN', 'true')
    expect(isFakeData({ fakeData: FAKE_DATA })).toBe(false)
  })
})

describe('Jobs: rules for review and publication', () => {
  it('lets a draft be saved with only a title and an institution', async () => {
    expect(await problems({ title: 'X', institution: 7, status: 'draft' })).toEqual({})
  })

  it('lists every missing fact at once, each at its field', async () => {
    const found = await problems({ title: 'X', institution: 7, status: 'in_review' })
    expect(Object.keys(found).sort()).toEqual([
      'deadlineDate',
      'originalUrl',
      'positionType',
      'subfields',
      'summary',
      'verifiedAt',
    ])
    expect(found.deadlineDate).toMatch(/Rolling or Until filled/)
  })

  it('asks for the deadline day only when the deadline is fixed', async () => {
    const found = await problems(complete({ deadlineKind: 'until-filled', deadlineDate: null }))
    expect(found).toEqual({})
  })

  it('needs every checklist box to publish, but not for review', async () => {
    const unchecked = complete({ checks: { employerOrigin: true } })
    expect(Object.keys(await problems(unchecked)).sort()).toEqual([
      'checks.deadlineConfirmed',
      'checks.noPersonalContacts',
      'checks.ownWords',
      'checks.positionOpen',
    ])
    expect(await problems({ ...unchecked, status: 'in_review', publishedAt: null })).toEqual({})
    expect(await problems(complete())).toEqual({})
  })

  it('refuses to publish a fixed deadline that has passed', async () => {
    const past = complete({ deadlineDate: '2020-01-15T12:00:00.000Z' })
    expect((await problems(past)).deadlineDate).toMatch(/has passed.*Expired/)
    expect(await problems({ ...past, status: 'expired' })).toEqual({})
  })

  it('counts the deadline day in its own time zone', async () => {
    vi.useFakeTimers({ now: new Date('2026-12-01T23:30:00Z'), toFake: ['Date'] })
    const today = complete({ deadlineDate: '2026-12-01T12:00:00.000Z' })
    // Still 1 December Anywhere on Earth, but already 2 December in Berlin.
    expect(await problems(today)).toEqual({})
    expect((await problems({ ...today, deadlineTz: 'Europe/Berlin' })).deadlineDate).toMatch(
      /has passed/,
    )
  })

  it('checks the address of the original posting', async () => {
    for (const originalUrl of ['www.example.org/job', 'ftp://example.org/job']) {
      expect((await problems(complete({ originalUrl }))).originalUrl).toMatch(/full address/)
    }
    expect((await problems({ title: 'X', originalUrl: 'example' })).originalUrl).toBeDefined()
  })

  it('keeps the address of the original posting to 2000 characters, also once encoded', async () => {
    const long = 'https://www.example.org/jobs/?q=' + 'a'.repeat(1970)
    expect(long).toHaveLength(2002)
    expect((await problems(complete({ originalUrl: long }))).originalUrl).toBeDefined()
    expect(await problems(complete({ originalUrl: long.slice(0, 2000) }))).toEqual({})
    // Also when its canonical form is short.
    const tracked = 'https://www.example.org/jobs/123?utm_source=' + 'a'.repeat(2000)
    expect((await problems(complete({ originalUrl: tracked }))).originalUrl).toBe(
      'validation:shorterThanMax',
    )
    // 999 characters as typed, but each of these letters takes 9 once percent-encoded.
    const encoded = 'https://www.example.org/jobs/' + '神経'.repeat(485)
    expect((await problems(complete({ originalUrl: encoded }))).originalUrl).toBe(
      'This address is too long.',
    )
  })

  it('refuses a day of verification in the future', async () => {
    const found = await problems(complete({ verifiedAt: '2099-01-01T12:00:00.000Z' }))
    expect(found.verifiedAt).toMatch(/future/)
  })

  describe('asks for a new day of verification', () => {
    const saved = complete()
    const findByID = vi.fn(async () => saved)
    const options = { event: 'submit' as const, id: 5, req: request({ find: finder(), findByID }) }
    const later = complete({ deadlineDate: '2099-02-28T12:00:00.000Z' })

    it('when the deadline of a published job changes', async () => {
      vi.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z'), toFake: ['Date'] })
      findByID.mockResolvedValue(saved)
      expect((await problems(later, options)).verifiedAt).toMatch(/deadline changed/)
      const berlin = complete({ deadlineTz: 'Europe/Berlin' })
      expect((await problems(berlin, options)).verifiedAt).toMatch(/deadline changed/)
      const rolling = complete({ deadlineKind: 'rolling', deadlineDate: null })
      expect((await problems(rolling, options)).verifiedAt).toMatch(/deadline changed/)
      // A later day is accepted, and so is today, also when the saved day is today.
      expect(await problems({ ...later, verifiedAt: '2026-09-21T12:00:00.000Z' }, options)).toEqual(
        {},
      )
      const today = '2026-09-25T12:00:00.000Z'
      findByID.mockResolvedValue({ ...saved, verifiedAt: today })
      expect(await problems({ ...later, verifiedAt: today }, options)).toEqual({})
      // Other corrections keep the saved day.
      findByID.mockResolvedValue(saved)
      expect(await problems(complete({ summary: 'Corrected.' }), options)).toEqual({})
    })

    it('when an expired or withdrawn job is published again', async () => {
      vi.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z'), toFake: ['Date'] })
      for (const status of ['expired', 'withdrawn']) {
        findByID.mockResolvedValue({ ...saved, status })
        expect((await problems(complete(), options)).verifiedAt).toMatch(/again/)
        const checked = complete({ verifiedAt: '2026-09-24T12:00:00.000Z' })
        expect(await problems(checked, options)).toEqual({})
        // Correcting it while it stays closed does not.
        expect(await problems(complete({ status }), options)).toEqual({})
      }
    })
  })

  it('keeps summaries to 280 characters', async () => {
    const found = await problems(complete({ summary: 'x'.repeat(281) }))
    expect(found.summary).toBeDefined()
  })

  it('refuses to take a published job back to draft or review through the save hooks', async () => {
    // The status check reads publishedAt as the save hook leaves it; restoring a version too.
    const originalDoc = complete({ publishedAt: '2026-09-01T08:00:00.000Z' })
    for (const status of ['draft', 'in_review']) {
      const data = await run({ status }, { operation: 'update', originalDoc })
      expect(data.publishedAt).toBe('2026-09-01T08:00:00.000Z')
      expect((await problems({ ...originalDoc, ...data })).status).toMatch(/cannot go back/)
    }
  })

  it('keeps published jobs out of draft and review, and drafts out of expired', async () => {
    const found = await problems(complete({ status: 'draft' }))
    expect(found.status).toMatch(/cannot go back/)
    const never = await problems({ title: 'X', status: 'withdrawn', publishedAt: null })
    expect(never.status).toMatch(/Only a job that has been published/)
    expect(await problems(complete({ status: 'withdrawn' }))).toEqual({})
  })

  it('does not publish a job marked as a duplicate, or one marked as its own duplicate', async () => {
    expect((await problems(complete({ duplicateOf: 9 }), { id: 5 })).duplicateOf).toMatch(
      /cannot be published/,
    )
    expect(
      (await problems(complete({ status: 'expired', duplicateOf: 5 }), { id: 5 })).duplicateOf,
    ).toMatch(/itself/)
  })
})

describe('Jobs: terms', () => {
  const find = finder()

  it('offers only terms of the right vocabulary, active ones and those already chosen', () => {
    const filter = (field('subfields') as { filterOptions: (a: unknown) => unknown }).filterOptions
    expect(filter({ data: { subfields: [12] } })).toEqual({
      and: [
        { vocabulary: { equals: 'subfield' } },
        { or: [{ isActive: { equals: true } }, { id: { in: [12] } }] },
      ],
    })
  })

  it('refuses a term from another vocabulary', async () => {
    const found = await problems(complete({ subfields: [3] }), {
      event: 'submit',
      req: request({ find }),
    })
    expect(found.subfields).toMatch(/Choose subfields from the list/)
  })

  it('keeps an inactive term a job already has, but refuses to add one', async () => {
    const req = request({ find })
    const job = { title: 'X', institution: 7, status: 'draft', subfields: [11, 12] }
    expect(await problems(job, { event: 'submit', previous: { subfields: [12] }, req })).toEqual({})
    const added = await problems(job, { event: 'submit', previous: { subfields: [11] }, req })
    expect(added.subfields).toBe('"Old subfield" is no longer in use. Choose another term.')
  })
})

describe('Jobs: duplicate warning', () => {
  const other = {
    id: 4,
    shortId: 'm7p2q',
    title: 'PhD position in glial calcium signalling',
    canonicalUrl: 'https://www.example.org/jobs/123',
    institution: 99,
    deadlineKind: 'rolling',
    deadlineDate: null,
    fingerprint: 'phd position in glial calcium signalling',
  }

  it('names the other job and says how to go on', async () => {
    const find = finder([other])
    const found = await problems(complete({ status: 'in_review' }), {
      event: 'submit',
      id: 5,
      req: request({ find }),
    })
    expect(found.confirmNotDuplicate).toBe(
      'This may be the same position as m7p2q "PhD position in glial calcium signalling" (same address). If it is a different position, tick "Not a duplicate". If it is the same, choose that job under "Duplicate of" and do not publish this one.',
    )
    const [args] = find.mock.calls.find(([call]) => call.collection === 'jobs')!
    expect(JSON.stringify(args.where)).toContain('"not_equals":"withdrawn"')
    expect(JSON.stringify(args.where)).toContain('"not_equals":5')
  })

  it('finds a similar title at the same institution with the same deadline day', async () => {
    const sameDay = {
      ...other,
      canonicalUrl: 'https://www.example.org/jobs/999',
      institution: 7,
      deadlineKind: 'fixed',
      deadlineDate: '2099-01-15T12:00:00.000Z',
      fingerprint: 'phd position in glial calcium signalling m f d',
    }
    const found = await problems(complete(), {
      event: 'submit',
      req: request({ find: finder([sameDay]) }),
    })
    expect(found.confirmNotDuplicate).toMatch(/similar title, same institution and deadline/)
  })

  it('looks up the same address, or the same institution and deadline day or kind', async () => {
    const find = finder([])
    const req = request({ find })
    await problems(complete(), { event: 'submit', id: 5, req })
    await problems(complete({ deadlineKind: 'rolling', deadlineDate: null }), {
      event: 'submit',
      id: 5,
      req,
    })
    const [fixed, rolling] = find.mock.calls
      .filter(([call]) => call.collection === 'jobs')
      .map(([call]) => call.where)
    const base = [{ status: { not_equals: 'withdrawn' } }, { duplicateOf: { exists: false } }]
    const sameAddress = { canonicalUrl: { equals: 'https://www.example.org/jobs/123' } }
    expect(fixed).toEqual({
      and: [
        ...base,
        {
          or: [
            sameAddress,
            {
              institution: { equals: 7 },
              deadlineDate: {
                greater_than_equal: '2099-01-15T00:00:00.000Z',
                less_than: '2099-01-16T00:00:00.000Z',
              },
            },
          ],
        },
        { id: { not_equals: 5 } },
      ],
    })
    expect(rolling).toEqual({
      and: [
        ...base,
        { or: [sameAddress, { institution: { equals: 7 }, deadlineKind: { equals: 'rolling' } }] },
        { id: { not_equals: 5 } },
      ],
    })
  })

  it('finds a similar title at the same institution when both deadlines are rolling', async () => {
    const rolling = {
      ...other,
      canonicalUrl: 'https://www.example.org/jobs/999',
      institution: 7,
      fingerprint: 'phd position in glial calcium signalling m f d',
    }
    const found = await problems(complete({ deadlineKind: 'rolling', deadlineDate: null }), {
      event: 'submit',
      req: request({ find: finder([rolling]) }),
    })
    expect(found.confirmNotDuplicate).toMatch(/similar title, same institution and deadline/)
  })

  it('is silenced by "Not a duplicate" or "Duplicate of", and skipped for drafts', async () => {
    const find = finder([other])
    const req = request({ find })
    const options = { event: 'submit' as const, req }
    expect(await problems(complete({ confirmNotDuplicate: true }), options)).toEqual({})
    expect(
      await problems(complete({ status: 'in_review', publishedAt: null, duplicateOf: 4 }), {
        ...options,
        id: 5,
      }),
    ).toEqual({})
    await problems({ ...complete(), status: 'draft', publishedAt: null }, options)
    expect(find.mock.calls.filter(([args]) => args.collection === 'jobs')).toEqual([])
  })

  it('leaves out jobs already marked as a duplicate', async () => {
    const find = finder([])
    await problems(complete(), { event: 'submit', req: request({ find }) })
    const [args] = find.mock.calls.find(([call]) => call.collection === 'jobs')!
    expect(JSON.stringify(args.where)).toContain('{"duplicateOf":{"exists":false}}')
  })

  it('lets "Not a duplicate" answer only the save it is ticked on', async () => {
    // Not stored, so a later change of the facts is checked again, and the other job too.
    expect(field('confirmNotDuplicate')).toMatchObject({
      virtual: true,
      admin: { readOnly: false },
    })
    const ticked = { ...other, confirmNotDuplicate: true, createdAt: '2026-09-20T00:00:00.000Z' }
    const job = complete({ createdAt: '2026-09-10T00:00:00.000Z' })
    const found = await problems(job, {
      event: 'submit',
      id: 5,
      req: request({ find: finder([ticked]) }),
    })
    expect(found.confirmNotDuplicate).toMatch(/m7p2q/)
  })

  it('checks again when the mark "Duplicate of" is cleared', async () => {
    const find = finder([other])
    const findByID = vi.fn(async () =>
      complete({ status: 'in_review', publishedAt: null, duplicateOf: 4 }),
    )
    const found = await problems(complete({ status: 'in_review', publishedAt: null }), {
      event: 'submit',
      id: 5,
      req: request({ find, findByID }),
    })
    expect(found.confirmNotDuplicate).toMatch(/m7p2q/)
  })

  it('does not check a published job again unless its title, address, institution or deadline change', async () => {
    const find = finder([other])
    const saved = complete()
    const findByID = vi.fn(async () => saved)
    const options = { event: 'submit' as const, id: 5, req: request({ find, findByID }) }
    expect(await problems(complete({ summary: 'Corrected summary.' }), options)).toEqual({})
    expect(find.mock.calls.filter(([args]) => args.collection === 'jobs')).toEqual([])
    const moved = await problems(complete({ originalUrl: 'https://www.example.org/jobs/124' }), {
      ...options,
      req: request({
        find: finder([{ ...other, canonicalUrl: 'https://www.example.org/jobs/124' }]),
        findByID,
      }),
    })
    expect(moved.confirmNotDuplicate).toMatch(/same address/)
    // Re-opening an expired job is checked again.
    findByID.mockResolvedValue({ ...saved, status: 'expired' })
    const reopened = await problems(complete(), { ...options, req: request({ find, findByID }) })
    expect(reopened.confirmNotDuplicate).toMatch(/m7p2q/)
  })

  it('checks the database only when saving, not while the form is edited', async () => {
    const find = finder([other])
    expect(await problems(complete(), { req: request({ find }) })).toEqual({})
    expect(find).not.toHaveBeenCalled()
  })

  it('lists at most five matches', () => {
    const matches = Array.from({ length: 7 }, (_, i) => ({
      shortId: `m7p2${i}`,
      title: 'Postdoc',
      reason: 'same-address' as const,
    }))
    expect(duplicateMessage(matches)).toMatch(/m7p24 "Postdoc" \(same address\) and 2 more\./)
  })
})

describe('Jobs: deleting', () => {
  const remove = Jobs.access?.delete as (args: { req: { user: unknown } }) => unknown

  it('lets signed-in editors delete only drafts that were never published', () => {
    expect(remove({ req: { user: { id: 1 } } })).toEqual({
      and: [{ status: { equals: 'draft' } }, { publishedAt: { exists: false } }],
    })
  })

  it('refuses every delete without a signed-in user', () => {
    expect(remove({ req: { user: null } })).toBe(false)
  })

  it('refuses to delete a published job, also for code that bypasses access control', async () => {
    const payload = (job: Record<string, unknown>) => ({ findByID: vi.fn(async () => job) })
    const remove = (job: Record<string, unknown>, context = {}) =>
      keepPublished?.({ id: 1, req: request(payload(job)), context } as never)
    await expect(remove({ status: 'expired', publishedAt: '2026-09-01' })).rejects.toThrow(
      /Withdrawn/,
    )
    await expect(remove({ status: 'in_review', publishedAt: null })).rejects.toThrow(/Only drafts/)
    await expect(remove({ status: 'draft', publishedAt: null })).resolves.toBeUndefined()
    await expect(
      remove({ status: 'expired', publishedAt: '2026-09-01' }, { fakeData: FAKE_DATA }),
    ).resolves.toBeUndefined()
  })
})

describe('Jobs: configuration', () => {
  it('keeps every change as a version (PLAN §5.2)', () => {
    expect(Jobs.versions).toEqual({ maxPerDoc: 100 })
  })

  it('offers no Duplicate action, since a copy would repeat the short ID', () => {
    expect(Jobs.disableDuplicate).toBe(true)
  })

  it('shows the short ID read-only and keeps it fixed', () => {
    expect(field('shortId').access?.update?.()).toBe(false)
    const [guard] = Jobs.hooks?.beforeChange ?? []
    expect(() =>
      guard?.({
        data: { shortId: 'zzzzz' },
        originalDoc: { shortId: 'k3f9a' },
        operation: 'update',
        req: {},
      } as never),
    ).toThrow()
  })

  it('stores the title as posted and the summary in English only', () => {
    for (const { field: f } of FIELDS) expect(f).not.toHaveProperty('localized')
  })

  it('offers every IANA time zone for the deadline, and leaves it empty for AoE', () => {
    const zones = (field('deadlineTz') as { options: { value: string }[] }).options
    expect(zones.length).toBeGreaterThan(400)
    expect(zones).toContainEqual({ value: 'America/New_York', label: 'America/New York' })
    expect(field('deadlineTz')).not.toHaveProperty('defaultValue')
    // PLAN §2.5, §3.2: the institution's time zone; AoE only when it is unknown.
    expect(field('deadlineTz').admin).toMatchObject({
      description: expect.stringMatching(
        /^The institution's time zone.*empty only if it is unknown/,
      ),
    })
  })

  it('lists jobs with their institution, status and deadline', () => {
    expect(Jobs.admin?.defaultColumns).toEqual([
      'title',
      'institution',
      'status',
      'deadlineDate',
      'updatedAt',
    ])
  })
})
