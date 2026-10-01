import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { DataRequests } from './DataRequests'

type DataField = Field & {
  name: string
  required?: boolean
  options?: unknown
  validate?: (value: unknown, options: Record<string, unknown>) => unknown
  access?: {
    create?: () => boolean
    update?: (args: { doc?: Record<string, unknown>; req?: { user: object | null } }) => boolean
  }
  admin?: { disableListColumn?: boolean; readOnly?: boolean }
}

function dataFields(fields: Field[]): DataField[] {
  return fields.flatMap((f) => {
    if (f.type === 'row' || f.type === 'collapsible') return dataFields(f.fields)
    return 'name' in f ? [f as DataField] : []
  })
}

const FIELDS = dataFields(DataRequests.fields)
const field = (name: string) => FIELDS.find((f) => f.name === name)!

const EDITOR = { id: 1 }
const request = (user: object | null = null) => ({
  t: (key: string) => key,
  user,
  payload: { collections: {}, config: { collections: [] } },
  context: {},
})

/** Runs the collection's beforeValidate hooks, as Payload does. */
async function prepare(
  data: Record<string, unknown>,
  {
    operation = 'create',
    originalDoc,
    user = null,
  }: {
    operation?: 'create' | 'update'
    originalDoc?: Record<string, unknown>
    user?: object | null
  } = {},
) {
  let result = data
  for (const hook of DataRequests.hooks?.beforeValidate ?? []) {
    result = (await hook({
      data: result,
      operation,
      originalDoc,
      context: {},
      req: request(user),
    } as never)) as Record<string, unknown>
  }
  return result
}

/** The messages of the save `run` refuses, or null when it goes through. */
function refusal(run: () => void): string[] | null {
  try {
    run()
  } catch (error) {
    return (
      (error as { data?: { errors?: { message: string }[] } }).data?.errors?.map(
        ({ message }) => message,
      ) ?? ['(not a validation error)']
    )
  }
  return null
}

/** Runs the beforeChange guards (fixed fields, the minimal unconfirmed record), as Payload does. */
function guard(
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
  user: object | null = EDITOR,
) {
  const operation = originalDoc ? 'update' : 'create'
  for (const hook of DataRequests.hooks?.beforeChange ?? []) {
    hook({ data, operation, originalDoc, req: request(user) } as never)
  }
}

const selectOptions = (name: string) => ({
  options: field(name).options,
  required: field(name).required,
  hasMany: false,
})

describe('DataRequests: access', () => {
  it('is read, recorded and handled by signed-in editors only', () => {
    for (const rule of [
      DataRequests.access?.read,
      DataRequests.access?.create,
      DataRequests.access?.update,
    ]) {
      expect(rule?.({ req: { user: EDITOR } } as never)).toBe(true)
      expect(rule?.({ req: { user: null } } as never)).toBe(false)
    }
  })

  it('is deleted by nobody: only the retention task removes a request', () => {
    expect(DataRequests.access?.delete?.({ req: { user: EDITOR } } as never)).toBe(false)
    expect(DataRequests.access?.delete?.({ req: { user: null } } as never)).toBe(false)
  })

  it('keeps no versions and no copies', () => {
    expect(DataRequests.versions).toBeUndefined()
    expect(DataRequests.disableDuplicate).toBe(true)
  })

  it('lets editors type what an emailed request says when they record it, never later', () => {
    for (const name of ['kind', 'email', 'name', 'details', 'locale', 'receivedAt']) {
      expect(field(name).access?.create, name).toBeUndefined()
      expect(field(name).access?.update?.({}), name).toBe(false)
    }
    expect(field('status').access).toBeUndefined()
  })

  it('lets editors say what was done only once a request is confirmed', () => {
    for (const name of ['action', 'actionNote']) {
      const rule = field(name).access?.update
      const req = { user: EDITOR }
      expect(field(name).access?.create, name).toBeUndefined()
      expect(rule?.({ doc: { status: 'unconfirmed' }, req }), name).toBe(false)
      for (const status of ['new', 'in-progress', 'closed']) {
        expect(rule?.({ doc: { status }, req }), `${name} ${status}`).toBe(true)
        expect(rule?.({ doc: { status }, req: { user: null } }), `${name} signed out`).toBe(false)
      }
    }
  })

  it('leaves the source, the address code, the dates and the outcome to the site', () => {
    for (const name of [
      'source',
      'emailHash',
      'respondBy',
      'closedAt',
      'purgeAt',
      'confirmationSentAt',
      'outcome',
    ]) {
      expect(field(name).access?.create?.(), name).toBe(false)
      expect(field(name).access?.update?.({}), name).toBe(false)
    }
  })
})

describe('DataRequests: personal data in the admin', () => {
  it('shows the address, the name, the details and the note in no list column', async () => {
    expect(DataRequests.admin?.defaultColumns).toEqual([
      'kind',
      'status',
      'respondBy',
      'source',
      'receivedAt',
    ])
    for (const name of ['email', 'name', 'details', 'actionNote', 'emailHash']) {
      expect(field(name).admin?.disableListColumn, name).toBe(true)
    }
    expect(DataRequests.admin?.enableListViewSelectAPI).toBe(true)
    const [hook] = DataRequests.hooks?.beforeOperation ?? []
    const select = { kind: true, email: true, name: true, details: true, actionNote: true }
    expect(
      await hook!({ args: { select }, operation: 'read', overrideAccess: false, req: {} } as never),
    ).toEqual({ select: { kind: true } })
  })

  it('sits with the review queue', () => {
    expect(DataRequests.admin?.group).toBe('Review queue')
  })
})

describe('DataRequests: recording', () => {
  it('marks a request an editor records as one that arrived by email', async () => {
    const data = await prepare(
      { kind: 'access', email: ' Someone@Example.org ', source: 'form', status: 'new' },
      { user: EDITOR },
    )
    expect(data).toMatchObject({ source: 'email', email: 'someone@example.org' })
    expect(typeof data.receivedAt).toBe('string')
    expect(data.respondBy).toBe(
      new Date(Date.parse(data.receivedAt as string) + 30 * 86_400_000).toISOString(),
    )
  })

  it('keeps the source the site gives, and the received date an editor gives', async () => {
    expect(await prepare({ kind: 'deletion', source: 'account', status: 'closed' })).toMatchObject({
      source: 'account',
    })
    const receivedAt = '2026-09-20T08:00:00.000Z'
    expect(
      await prepare({ kind: 'access', email: 'a@example.org', receivedAt }, { user: EDITOR }),
    ).toMatchObject({ receivedAt, respondBy: '2026-10-20T08:00:00.000Z' })
  })

  it('keeps an unconfirmed request for 60 days, with nothing due', async () => {
    const receivedAt = '2026-10-01T10:00:00.000Z'
    expect(
      await prepare({ kind: 'deletion', status: 'unconfirmed', source: 'form', receivedAt }),
    ).toMatchObject({ respondBy: null, closedAt: null, purgeAt: '2026-11-30T10:00:00.000Z' })
  })

  it('needs the address of a request recorded from an email', async () => {
    const validate = field('email').validate!
    expect(await validate(null, { data: { source: 'email' }, req: request(EDITOR) })).toMatch(
      /address the request came from/,
    )
    expect(await validate(null, { data: { source: 'form' }, req: request() })).toBe(true)
  })
})

describe('DataRequests: handling', () => {
  const status = (
    value: string,
    previousValue: unknown,
    user: object | null,
    operation = 'update',
  ) =>
    field('status').validate!(value, {
      ...selectOptions('status'),
      data: {},
      operation,
      previousValue,
      req: request(user),
    })

  it('lets editors record emailed requests as New only', async () => {
    expect(await status('new', undefined, EDITOR, 'create')).toBe(true)
    expect(await status('unconfirmed', undefined, EDITOR, 'create')).toMatch(/starts as New/)
    expect(await status('closed', undefined, EDITOR, 'create')).toMatch(/starts as New/)
  })

  it('leaves confirming a request to the person’s link', async () => {
    expect(await status('new', 'unconfirmed', EDITOR)).toMatch(/confirms it with the link/)
    expect(await status('closed', 'unconfirmed', EDITOR)).toMatch(/confirms it with the link/)
    expect(await status('unconfirmed', 'new', EDITOR)).toMatch(/Only the form/)
    // The site's own code confirms it.
    expect(await status('new', 'unconfirmed', null)).toBe(true)
    expect(await status('closed', 'unconfirmed', null)).toBe(true)
    expect(await status('unconfirmed', undefined, null, 'create')).toBe(true)
  })

  it('never goes back to New', async () => {
    expect(await status('new', 'closed', EDITOR)).toMatch(/does not go back to New/)
    expect(await status('in-progress', 'closed', EDITOR)).toBe(true)
  })

  it('needs an action to close, and keeps "deleted automatically" for the site', async () => {
    const action = (value: string | null, data: Record<string, unknown>, user: object | null) =>
      field('action').validate!(value, {
        ...selectOptions('action'),
        data,
        previousValue: null,
        req: request(user),
      })
    expect(await action(null, { status: 'closed' }, EDITOR)).toMatch(/before closing/)
    expect(await action('answered', { status: 'closed' }, EDITOR)).toBe(true)
    expect(await action('deleted-automatically', { status: 'closed' }, EDITOR)).toMatch(
      /Only the site/,
    )
    expect(await action('deleted-automatically', { status: 'closed' }, null)).toBe(true)
  })

  it('stores what the person wrote once, when they confirm, and never changes it', async () => {
    const unconfirmed = {
      id: 7,
      kind: 'access',
      source: 'form',
      status: 'unconfirmed',
      email: null,
      name: null,
      details: null,
      locale: 'en',
      receivedAt: '2026-10-01T10:00:00.000Z',
      emailHash: 'a'.repeat(64),
    }
    // The confirmation fills them in.
    const confirmed = {
      email: 'someone@example.org',
      name: 'A. Person',
      details: 'A copy of my data, please.',
      status: 'new',
    }
    expect(() => guard({ ...confirmed }, unconfirmed)).not.toThrow()
    // Once stored, neither they nor the fixed fields change.
    const stored = { ...unconfirmed, ...confirmed }
    for (const change of [
      { email: 'other@example.org' },
      { name: 'Someone else' },
      { details: 'Changed.' },
      { kind: 'deletion' },
      { source: 'email' },
      { emailHash: 'b'.repeat(64) },
      { receivedAt: '2026-09-01T00:00:00.000Z' },
    ]) {
      expect(() => guard(change, stored), JSON.stringify(change)).toThrow()
    }
    // An admin save that leaves them out gets them back from the record.
    const restored = await prepare(
      { status: 'in-progress' },
      { operation: 'update', originalDoc: stored, user: EDITOR },
    )
    expect(restored).toMatchObject({ email: 'someone@example.org', kind: 'access', source: 'form' })
  })

  it('keeps an unconfirmed request free of notes and actions, whoever saves it', () => {
    const unconfirmed = { id: 7, kind: 'access', source: 'form', status: 'unconfirmed' }
    for (const user of [EDITOR, null]) {
      for (const change of [
        { actionNote: 'Sent by someone, asked to resend.' },
        { action: 'not-applicable' },
        { status: 'unconfirmed', actionNote: 'A note.' },
      ]) {
        expect(
          refusal(() => guard({ ...change }, unconfirmed, user)),
          JSON.stringify(change),
        ).toEqual([
          'An unconfirmed request holds nothing but its kind, its date and its address code.',
        ])
      }
      // Nor when the site records one.
      expect(
        refusal(() =>
          guard(
            { kind: 'deletion', status: 'unconfirmed', actionNote: 'A note.' },
            undefined,
            user,
          ),
        ),
      ).toEqual([
        'An unconfirmed request holds nothing but its kind, its date and its address code.',
      ])
    }
    // An empty note is no note.
    const empty = { actionNote: '', action: null }
    expect(() => guard(empty, unconfirmed)).not.toThrow()
    expect(empty.actionNote).toBeNull()
    expect(() => guard({ status: 'unconfirmed' }, unconfirmed)).not.toThrow()
    // The site's confirmation stores the action of a deletion it did; editors note confirmed ones.
    expect(() =>
      guard({ status: 'closed', action: 'deleted-automatically' }, unconfirmed, null),
    ).not.toThrow()
    expect(() =>
      guard({ actionNote: 'Answered by email.' }, { ...unconfirmed, status: 'new' }),
    ).not.toThrow()
  })
})
