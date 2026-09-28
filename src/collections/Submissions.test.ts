import type { Field } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Submissions } from './Submissions'

type DataField = Field & {
  name: string
  validate?: (value: unknown, options: Record<string, unknown>) => unknown
  access?: {
    create?: () => boolean
    update?: (args: {
      req?: { user: Record<string, unknown> | null }
      doc?: Record<string, unknown>
    }) => boolean
  }
  admin?: { disableListColumn?: boolean; readOnly?: boolean }
}

function dataFields(fields: Field[]): DataField[] {
  return fields.flatMap((f) => {
    if (f.type === 'row' || f.type === 'collapsible') return dataFields(f.fields)
    return 'name' in f ? [f as DataField] : []
  })
}

const FIELDS = dataFields(Submissions.fields)
const field = (name: string) => FIELDS.find((f) => f.name === name)!

type Mock = ReturnType<typeof vi.fn>
const request = (payload: { findByID?: Mock; create?: Mock; update?: Mock } = {}) => ({
  t: (key: string) => key,
  payload: {
    collections: {},
    config: { collections: [] },
    findByID: vi.fn(async () => null),
    ...payload,
  },
  context: {},
})

const [prepare] = Submissions.hooks?.beforeValidate ?? []
const [queue] = Submissions.hooks?.afterChange ?? []

const run = (
  data: Record<string, unknown>,
  {
    operation = 'create',
    originalDoc,
    candidate = null,
  }: {
    operation?: 'create' | 'update'
    originalDoc?: Record<string, unknown>
    candidate?: Record<string, unknown> | null
  } = {},
) => {
  const findByID = vi.fn(async () => candidate)
  const result = prepare?.({
    data,
    operation,
    originalDoc,
    context: {},
    req: request({ findByID }),
  } as never) as Promise<Record<string, unknown>>
  return Object.assign(result, { findByID })
}

const suggestion = (overrides: Record<string, unknown> = {}) => ({
  url: 'https://www.example.org/jobs/123',
  kind: 'position',
  note: 'Seen on a mailing list.',
  email: 'someone@example.org',
  consentToContact: true,
  locale: 'en',
  ...overrides,
})

describe('Submissions: personal data', () => {
  it('never stores an email address given without consent', async () => {
    expect((await run(suggestion({ consentToContact: false }))).email).toBeNull()
    expect((await run(suggestion({ consentToContact: undefined }))).email).toBeNull()
    expect((await run(suggestion())).email).toBe('someone@example.org')
  })

  it('trims what was typed', async () => {
    const data = await run(
      suggestion({ url: ' https://www.example.org/jobs/1 ', note: '  ', email: ' a@example.org ' }),
    )
    expect(data).toMatchObject({
      url: 'https://www.example.org/jobs/1',
      note: null,
      email: 'a@example.org',
    })
  })

  it('shows the email address and the note in no list column', () => {
    expect(Submissions.admin?.defaultColumns).toEqual(['url', 'kind', 'status', 'createdAt'])
    expect(field('email').admin?.disableListColumn).toBe(true)
    expect(field('note').admin?.disableListColumn).toBe(true)
    // The list loads only the columns it shows, so it never sends them to the browser.
    expect(Submissions.admin?.enableListViewSelectAPI).toBe(true)
  })

  it('never loads them into the list, even when a link or a saved preference asks for them', async () => {
    const [hook] = Submissions.hooks?.beforeOperation ?? []
    const read = (select: Record<string, boolean> | undefined, overrideAccess: boolean) =>
      hook!({ args: { select }, operation: 'read', overrideAccess, req: {} } as never)
    // The admin list: ?columns=["email","note","url"].
    expect(await read({ url: true, email: true, note: true }, false)).toEqual({
      select: { url: true },
    })
    // The document view asks for no fields, and server code bypasses access control.
    expect(await read(undefined, false)).toEqual({ select: undefined })
    expect(await read({ email: true }, true)).toEqual({ select: { email: true } })
  })

  it('keeps what the person sent unchanged by editors', () => {
    for (const name of ['url', 'kind', 'note', 'email', 'consentToContact', 'locale']) {
      expect(field(name).access?.update?.({})).toBe(false)
      expect(field(name).admin?.readOnly).toBe(true)
    }
  })

  it('refuses a longer email address than can be delivered', async () => {
    const validate = field('email').validate!
    const long = `${'a'.repeat(250)}@example.org`
    expect(await validate(long, { req: request() })).toBe('This email address is too long.')
  })
})

describe('Submissions: status', () => {
  it('follows the candidate, with the purge date 90 days after its decision', async () => {
    const queued = run(suggestion({ candidate: 4 }), { candidate: { status: 'triaged' } })
    expect(await queued).toMatchObject({ status: 'queued', decidedAt: null, emailPurgeAt: null })
    expect(queued.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'candidates', id: 4 }),
    )
    const decided = await run(
      { status: 'new' },
      {
        operation: 'update',
        originalDoc: { ...suggestion(), candidate: 4, status: 'queued' },
        candidate: { status: 'rejected', decidedAt: '2026-09-28T09:00:00.000Z' },
      },
    )
    expect(decided).toMatchObject({
      status: 'decided',
      candidate: 4,
      decidedAt: '2026-09-28T09:00:00.000Z',
      emailPurgeAt: '2026-12-27T09:00:00.000Z',
    })
  })

  it('is set by editors only while there is no candidate', () => {
    const update = field('status').access!.update!
    const req = { user: { id: 1 } }
    expect(update({ req, doc: { candidate: null } })).toBe(true)
    expect(update({ req, doc: { candidate: 4 } })).toBe(false)
    expect(update({ req, doc: { candidate: { id: 4 } } })).toBe(false)
    // Signed out, the rule tells nothing (Payload's permission routes run it for anyone).
    expect(update({ req: { user: null }, doc: { candidate: null } })).toBe(false)
  })

  it('without a candidate, is new until an editor decides it', async () => {
    expect(await run(suggestion({ kind: 'event' }))).toMatchObject({
      status: 'new',
      decidedAt: null,
      emailPurgeAt: null,
    })
    const decided = await run(
      { status: 'decided' },
      { operation: 'update', originalDoc: { ...suggestion({ kind: 'event' }), status: 'new' } },
    )
    expect(decided.status).toBe('decided')
    expect(Date.now() - Date.parse(decided.decidedAt as string)).toBeLessThan(5000)
    const validate = field('status').validate!
    expect(await validate('queued', { data: { candidate: null }, req: request() })).toMatch(
      /Only a suggestion with a candidate/,
    )
  })
})

describe('Submissions: into the review queue', () => {
  const hook = (doc: Record<string, unknown>, operation: 'create' | 'update' = 'create') => {
    const create = vi.fn(async () => ({ id: 4 }))
    const findByID = vi.fn(async () => ({ id: doc.id, candidate: 4, status: 'queued' }))
    const req = request({ create, findByID })
    const result = queue?.({ doc, operation, req } as never) as Promise<Record<string, unknown>>
    return { result, create, req }
  }

  it('makes a job candidate from a suggested position, in the same transaction', async () => {
    const { result, create, req } = hook({ id: 9, ...suggestion(), status: 'new' })
    expect(await result).toMatchObject({ id: 9, candidate: 4, status: 'queued' })
    expect(create).toHaveBeenCalledWith({
      collection: 'candidates',
      data: {
        kind: 'job',
        rawUrl: 'https://www.example.org/jobs/123',
        submission: 9,
        status: 'new',
      },
      depth: 0,
      req,
    })
  })

  it('leaves other kinds for their milestones, and saves after the first', async () => {
    for (const kind of ['event', 'funding', 'paper', 'news', 'resource', 'other']) {
      const { result, create } = hook({ id: 9, ...suggestion({ kind }), status: 'new' })
      expect(await result).toMatchObject({ status: 'new' })
      expect(create).not.toHaveBeenCalled()
    }
    const later = hook({ id: 9, ...suggestion(), status: 'queued', candidate: 4 }, 'update')
    await later.result
    expect(later.create).not.toHaveBeenCalled()
  })
})

describe('Submissions: access', () => {
  it('lets nobody create suggestions through the API or the admin', () => {
    const create = Submissions.access?.create as (args: { req: { user: unknown } }) => unknown
    expect(create({ req: { user: { id: 1 } } })).toBe(false)
  })

  it('lets signed-in editors delete one, to answer a data request', () => {
    const remove = Submissions.access?.delete as (args: { req: { user: unknown } }) => unknown
    expect(remove({ req: { user: { id: 1 } } })).toBe(true)
    expect(remove({ req: { user: null } })).toBe(false)
  })

  it('lets only the hooks set the candidate and the dates', () => {
    for (const name of ['candidate', 'decidedAt', 'emailPurgeAt', 'notifiedAt']) {
      expect(field(name).access?.update?.({})).toBe(false)
    }
  })
})
