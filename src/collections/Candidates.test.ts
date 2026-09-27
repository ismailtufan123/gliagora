import type { Field } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Candidates, draftJob } from './Candidates'
import { FAKE_DATA } from './Jobs'

type Validate = (value: unknown, options: Record<string, unknown>) => unknown
type DataField = Field & {
  name: string
  validate?: Validate
  access?: { create?: () => boolean; update?: () => boolean }
  admin?: { condition?: (data: unknown, siblingData: unknown, ctx: unknown) => boolean }
}

// Every field that holds data (rows and collapsibles add no prefix).
function dataFields(fields: Field[]): DataField[] {
  return fields.flatMap((f) => {
    if (f.type === 'row' || f.type === 'collapsible') return dataFields(f.fields)
    return 'name' in f ? [f as DataField] : []
  })
}

const FIELDS = dataFields(Candidates.fields)
const field = (name: string) => FIELDS.find((f) => f.name === name)!

type Mock = ReturnType<typeof vi.fn>
type Payload = { find?: Mock; findByID?: Mock; create?: Mock; update?: Mock }

const request = (payload: Payload = {}) => ({
  t: (key: string) => key,
  payload: {
    collections: {},
    db: { defaultIDType: 'number' },
    find: vi.fn(async () => ({ docs: [] })),
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

/** Runs the field validations as Payload does on save, and returns the messages by field. */
async function problems(
  data: Record<string, unknown>,
  {
    event = 'submit',
    operation = 'update',
    previous = {},
    req = request(),
  }: {
    event?: 'onChange' | 'submit'
    operation?: 'create' | 'update'
    previous?: Record<string, unknown>
    req?: ReturnType<typeof request>
  } = {},
) {
  const result: Record<string, string> = {}
  for (const f of FIELDS) {
    if (!f.validate) continue
    if (f.admin?.condition && !f.admin.condition(data, data, {})) continue
    const message = await f.validate(data[f.name], {
      ...f,
      data,
      siblingData: data,
      event,
      operation,
      req,
      previousValue: previous[f.name],
    })
    if (message !== true) result[f.name] = message as string
  }
  return result
}

const [acceptOneAtATime] = Candidates.hooks?.beforeOperation ?? []
const [prepare] = Candidates.hooks?.beforeValidate ?? []
const [afterDecision] = Candidates.hooks?.afterChange ?? []
const [keepCandidates] = Candidates.hooks?.beforeDelete ?? []

const run = (
  data: Record<string, unknown>,
  {
    operation = 'create',
    originalDoc,
    payload = {},
  }: {
    operation?: 'create' | 'update'
    originalDoc?: Record<string, unknown>
    payload?: Payload
  } = {},
) =>
  prepare?.({
    data,
    operation,
    originalDoc,
    context: {},
    req: request(payload),
  } as never) as Promise<Record<string, unknown>>

// A candidate with everything accepting needs.
const ready = (overrides: Record<string, unknown> = {}) => ({
  kind: 'job',
  status: 'accepted',
  rawUrl: 'https://www.example.org/jobs/123',
  rawTitle: 'PhD position in glial calcium signalling',
  institution: 7,
  ...overrides,
})

describe('Candidates: values filled in on save', () => {
  it('makes the canonical address and the title fingerprint', async () => {
    const data = await run({
      rawUrl: ' https://Example.org/jobs/7/?utm_source=list ',
      rawTitle: '  PhD Position – Glia & Memory ',
    })
    expect(data).toMatchObject({
      rawUrl: 'https://Example.org/jobs/7/?utm_source=list',
      canonicalUrl: 'https://example.org/jobs/7',
      rawTitle: 'PhD Position – Glia & Memory',
      fingerprint: 'phd position glia memory',
    })
    expect(await run({ rawUrl: '  ', rawTitle: '' })).toMatchObject({
      rawUrl: null,
      canonicalUrl: null,
      fingerprint: null,
    })
  })

  it('records when it was decided, and clears it when reopened', async () => {
    const rejected = await run(
      { status: 'rejected', decisionReason: 'spam', duplicateOf: 4 },
      { operation: 'update', originalDoc: { id: 1, status: 'triaged' } },
    )
    expect(Date.now() - Date.parse(rejected.decidedAt as string)).toBeLessThan(5000)
    expect(rejected).toMatchObject({ decisionReason: 'spam', duplicateOf: null })

    const earlier = '2026-09-01T08:00:00.000Z'
    const saved = { id: 1, status: 'rejected', decidedAt: earlier, decisionReason: 'spam' }
    const again = await run(
      { decisionNote: 'Checked.' },
      { operation: 'update', originalDoc: saved },
    )
    expect(again.decidedAt).toBe(earlier)
    const reopened = await run({ status: 'triaged' }, { operation: 'update', originalDoc: saved })
    expect(reopened).toMatchObject({ decidedAt: null, decisionReason: null })
  })

  it('keeps the suggestion and the job it was linked to', async () => {
    const originalDoc = { id: 1, status: 'accepted', submission: 3, publishedRef: 12 }
    // An editor's save, or a restored version, leaves them out or brings other values.
    const data = await run({ submission: 9 }, { operation: 'update', originalDoc })
    expect(data).toMatchObject({ submission: 3, publishedRef: 12 })
    // Code restoring a version from before the link (access control does not remove the field).
    const restored = await run(
      { status: 'accepted', submission: 3, publishedRef: null },
      { operation: 'update', originalDoc },
    )
    expect(restored.publishedRef).toBe(12)
    expect(
      (await run({ publishedRef: 20 }, { operation: 'update', originalDoc })).publishedRef,
    ).toBe(12)
    // The accept hook links the job through the local API.
    const linked = await run(
      { publishedRef: 20 },
      { operation: 'update', originalDoc: { ...originalDoc, publishedRef: null } },
    )
    expect(linked.publishedRef).toBe(20)
    // A new candidate from a suggestion keeps its link.
    expect((await run({ submission: 3 })).submission).toBe(3)
  })

  it('lists jobs with the same address or a similar title at the same institution', async () => {
    const find = vi.fn(async ({ collection }: { collection: string; where?: unknown }) => ({
      docs:
        collection === 'jobs'
          ? [
              { id: 1, canonicalUrl: 'https://example.org/jobs/7', fingerprint: 'postdoc' },
              {
                id: 2,
                canonicalUrl: 'https://example.org/jobs/8',
                fingerprint: 'phd position in glial calcium signaling',
              },
              {
                id: 3,
                canonicalUrl: 'https://example.org/jobs/9',
                fingerprint: 'research engineer',
              },
            ]
          : [{ id: 5, status: 'new' }],
    }))
    const data = await run(
      {
        rawUrl: 'https://example.org/jobs/7',
        rawTitle: 'PhD position in glial calcium signalling',
        institution: 7,
      },
      {
        operation: 'update',
        originalDoc: { id: 4, status: 'new', publishedRef: 30 },
        payload: { find },
      },
    )
    expect(data.possibleDuplicates).toEqual([1, 2])
    expect(data.possibleDuplicateCandidates).toEqual([5])
    const [jobs, candidates] = find.mock.calls.map(([args]) => args)
    expect(jobs?.where).toEqual({
      and: [
        {
          or: [
            { canonicalUrl: { equals: 'https://example.org/jobs/7' } },
            {
              institution: { equals: 7 },
              status: { in: ['draft', 'in_review', 'published'] },
              duplicateOf: { exists: false },
            },
          ],
        },
        // The job made from this candidate repeats it by design.
        { id: { not_equals: 30 } },
      ],
    })
    expect(candidates).toMatchObject({
      collection: 'candidates',
      where: {
        and: [
          { canonicalUrl: { equals: 'https://example.org/jobs/7' } },
          { status: { not_equals: 'rejected' } },
          { id: { not_equals: 4 } },
        ],
      },
    })
  })

  it('looks nothing up without an address or a title and institution', async () => {
    const find = vi.fn(async () => ({ docs: [] }))
    const data = await run({ rawTitle: 'Postdoc' }, { payload: { find } })
    expect(find).not.toHaveBeenCalled()
    expect(data).toMatchObject({ possibleDuplicates: [], possibleDuplicateCandidates: [] })
  })
})

describe('Candidates: rules', () => {
  it('saves a new candidate with an address alone, or with nothing yet', async () => {
    expect(await problems({ status: 'new' }, { operation: 'create' })).toEqual({})
    expect(
      await problems(
        { status: 'triaged', rawUrl: 'https://www.example.org/jobs/1' },
        { operation: 'create' },
      ),
    ).toEqual({})
  })

  it('refuses a decision before the candidate is saved', async () => {
    const found = await problems(ready(), { operation: 'create' })
    expect(found.status).toMatch(/starts as New or Triaged/)
  })

  it('needs the address, the title and the institution to accept', async () => {
    const found = await problems({ status: 'accepted' }, { previous: { status: 'triaged' } })
    expect(Object.keys(found).sort()).toEqual(['institution', 'rawTitle', 'rawUrl'])
    expect(await problems(ready(), { previous: { status: 'triaged' } })).toEqual({})
  })

  it('refuses to accept a posting that already has a job, and names it', async () => {
    const find = vi.fn(async () => ({ docs: [{ id: 3, shortId: 'm7p2q', title: 'PhD position' }] }))
    const found = await problems(ready({ rawUrl: 'http://www.example.org/jobs/123/#apply' }), {
      previous: { status: 'triaged' },
      req: request({ find }),
    })
    expect(found.status).toBe(
      'A job with this address already exists: m7p2q "PhD position". Mark this candidate as a duplicate of that job instead.',
    )
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'jobs',
        where: { canonicalUrl: { equals: 'https://www.example.org/jobs/123' } },
      }),
    )
    // Not again once accepted (the job made from it has that address), nor while editing.
    find.mockClear()
    expect(
      await problems(ready(), { previous: { status: 'accepted' }, req: request({ find }) }),
    ).toEqual({})
    await problems(ready(), {
      event: 'onChange',
      previous: { status: 'triaged' },
      req: request({ find }),
    })
    expect(find).not.toHaveBeenCalled()
  })

  it('keeps an accepted candidate accepted', async () => {
    const found = await problems(ready({ status: 'triaged' }), { previous: { status: 'accepted' } })
    expect(found.status).toMatch(/final/)
  })

  it('reopens a rejected or duplicate candidate only as triaged', async () => {
    const found = await problems(
      { status: 'duplicate', duplicateOf: 3 },
      { previous: { status: 'rejected' } },
    )
    expect(found.status).toMatch(/reopen/)
    expect(await problems({ status: 'triaged' }, { previous: { status: 'duplicate' } })).toEqual({})
  })

  it('judges the move once the admin form knows the saved status', async () => {
    // The first form state has no saved value yet; saving checks it anyway.
    expect(await problems(ready(), { event: 'onChange' })).toEqual({})
    const found = await problems(ready({ status: 'new' }), {
      event: 'onChange',
      previous: { status: 'accepted' },
    })
    expect(found.status).toMatch(/final/)
  })

  it('asks why a candidate is rejected, and for a note when the reason is "other"', async () => {
    const previous = { status: 'triaged' }
    expect((await problems({ status: 'rejected' }, { previous })).decisionReason).toBe(
      'Choose why it is rejected.',
    )
    const other = await problems({ status: 'rejected', decisionReason: 'other' }, { previous })
    expect(other).toEqual({ decisionNote: 'Say why it is rejected.' })
    expect(
      await problems(
        { status: 'rejected', decisionReason: 'other', decisionNote: 'An internship.' },
        { previous },
      ),
    ).toEqual({})
    expect(
      await problems(
        { status: 'rejected', decisionReason: 'agency-or-intermediary' },
        { previous },
      ),
    ).toEqual({})
  })

  it('asks which job a duplicate repeats', async () => {
    const previous = { status: 'new' }
    expect((await problems({ status: 'duplicate' }, { previous })).duplicateOf).toBe(
      'Choose the job this candidate repeats.',
    )
    expect(await problems({ status: 'duplicate', duplicateOf: 3 }, { previous })).toEqual({})
  })

  it('checks the address as it checks a job posting', async () => {
    const found = await problems({ status: 'new', rawUrl: 'www.example.org/jobs/1' })
    expect(found.rawUrl).toMatch(/full address/)
  })
})

describe('Candidates: accepting', () => {
  const accepted = {
    id: 4,
    ...ready(),
    submission: 9,
    publishedRef: null,
    decidedAt: '2026-09-28T09:00:00.000Z',
  }
  const hook = (doc: Record<string, unknown>, previousDoc: Record<string, unknown>) => {
    const create = vi.fn(async () => ({ id: 30 }))
    const update = vi.fn(async () => ({ id: 4, updatedAt: '2026-09-28T09:00:01.000Z' }))
    const req = request({ create, update })
    const result = afterDecision?.({ doc, previousDoc, operation: 'update', req } as never)
    return { result: result as Promise<Record<string, unknown>>, create, update, req }
  }

  it('makes a draft job from the candidate, links it under publishedRef and passes on the suggestion, in the same transaction', async () => {
    const { result, create, update, req } = hook(accepted, {
      ...accepted,
      status: 'triaged',
      decidedAt: null,
    })
    expect(await result).toMatchObject({ id: 4, publishedRef: 30 })
    expect(create).toHaveBeenCalledWith({
      collection: 'jobs',
      data: expect.objectContaining({
        title: 'PhD position in glial calcium signalling',
        institution: 7,
        originalUrl: 'https://www.example.org/jobs/123',
        status: 'draft',
        submission: 9,
        internalNotes: expect.stringMatching(/^Made from candidate 4 of the review queue/),
      }),
      depth: 0,
      req,
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'candidates', id: 4, data: { publishedRef: 30 }, req }),
    )
    // The suggestion follows the decision.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'submissions', id: 9, data: { candidate: 4 }, req }),
    )
  })

  it('makes the job only once', async () => {
    const { result, create } = hook(
      { ...accepted, publishedRef: 30 },
      { ...accepted, publishedRef: 30 },
    )
    await result
    expect(create).not.toHaveBeenCalled()
  })

  it('updates the suggestion only when a decision is made or undone', async () => {
    const open = { id: 4, status: 'triaged', submission: 9, decidedAt: null }
    const quiet = hook({ ...open, decisionNote: 'Checked.' }, { ...open, status: 'new' })
    await quiet.result
    expect(quiet.update).not.toHaveBeenCalled()
    const rejected = { ...open, status: 'rejected', decidedAt: '2026-09-28T09:00:00.000Z' }
    const reopened = hook(open, rejected)
    await reopened.result
    expect(reopened.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'submissions', id: 9 }),
    )
    const alone = hook({ ...rejected, submission: null }, open)
    await alone.result
    expect(alone.update).not.toHaveBeenCalled()
  })

  it('updates the suggestion as a normal save, also while a version is restored', async () => {
    // Payload sets isRestoringVersion on the request it passes to the hooks of a restore; the
    // suggestion's own save must not inherit it, or its missing fields are not filled in.
    const open = { id: 4, status: 'triaged', submission: 9, decidedAt: null }
    const rejected = { ...open, status: 'rejected', decidedAt: '2026-09-28T09:00:00.000Z' }
    const restored = hook(open, rejected)
    restored.req.context = { isRestoringVersion: true } as never
    await restored.result
    expect(restored.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'submissions',
        id: 9,
        data: { candidate: 4 },
        context: { isRestoringVersion: false },
      }),
    )
  })

  it('accepts one candidate at a time, never in a bulk update', () => {
    // Bulk updates save in parallel, so two candidates with the same address would both pass
    // the same-address check and make two jobs.
    const before = (args: Record<string, unknown>) =>
      acceptOneAtATime?.({ args, operation: 'update', req: request(), context: {} } as never)
    const where = { id: { in: [4, 5] } }
    expect(() => before({ where, data: { status: 'accepted' } })).toThrow(/one at a time/)
    // Bulk reject and triage, and a save by ID, go ahead.
    const reject = { where, data: { status: 'rejected', decisionReason: 'spam' } }
    expect(before(reject)).toBe(reject)
    const one = { id: 4, data: { status: 'accepted' } }
    expect(before(one)).toBe(one)
  })

  it('makes a job without a suggestion for a candidate added by hand', () => {
    const job = draftJob({ ...accepted, submission: null } as never, new Date('2026-09-28T09:00Z'))
    expect(job).toMatchObject({
      submission: null,
      internalNotes: expect.stringMatching(/2026-09-28/),
    })
  })
})

describe('Candidates: deleting', () => {
  it('is refused to everyone, also through the API', () => {
    const remove = Candidates.access?.delete as (args: { req: { user: unknown } }) => unknown
    expect(remove({ req: { user: { id: 1 } } })).toBe(false)
  })

  it('is refused for code that bypasses access control, except the fake data script', () => {
    expect(() => keepCandidates?.({ id: 1, req: request(), context: {} } as never)).toThrow(
      /never deleted/,
    )
    expect(
      keepCandidates?.({ id: 1, req: request(), context: { fakeData: FAKE_DATA } } as never),
    ).toBeUndefined()
  })
})

describe('Candidates: configuration', () => {
  it('keeps every decision as a version', () => {
    expect(Candidates.versions).toEqual({ maxPerDoc: 20 })
    expect(Candidates.disableDuplicate).toBe(true)
  })

  it('lists the queue newest first with title, address, status, institution and date', () => {
    expect(Candidates.defaultSort).toBe('-createdAt')
    // A candidate from a suggestion has only its address at first.
    expect(Candidates.admin?.defaultColumns).toEqual([
      'rawTitle',
      'rawUrl',
      'status',
      'institution',
      'createdAt',
    ])
    expect(Candidates.admin?.group).toBe('Review queue')
    expect(Candidates.admin?.description).toMatch(/open the original posting.*Accepted.*draft job/)
  })

  it('lets only the hooks set the links, the duplicates and the decision time', () => {
    for (const name of [
      'possibleDuplicates',
      'possibleDuplicateCandidates',
      'decidedAt',
      'publishedRef',
      'submission',
    ]) {
      expect(field(name).access?.create?.()).toBe(false)
      expect(field(name).access?.update?.()).toBe(false)
    }
  })

  it('shows the reason only for a rejection and "Duplicate of" only for a duplicate', () => {
    const shown = (name: string, status: string) =>
      field(name).admin?.condition?.({ status }, {}, {})
    expect(shown('decisionReason', 'rejected')).toBe(true)
    expect(shown('decisionReason', 'triaged')).toBe(false)
    expect(shown('duplicateOf', 'duplicate')).toBe(true)
    expect(shown('duplicateOf', 'accepted')).toBe(false)
  })
})
