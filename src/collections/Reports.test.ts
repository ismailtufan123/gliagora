import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { personalRightsDueWhere, personalRightsOverdueWhere } from '@/lib/review/dashboard'

import { Reports } from './Reports'

type DataField = Field & {
  name: string
  validate?: (value: unknown, options: Record<string, unknown>) => unknown
  access?: {
    create?: () => boolean
    update?: (args: { doc?: Record<string, unknown> }) => boolean
  }
  admin?: {
    description?: string
    disableListColumn?: boolean
    readOnly?: boolean
    position?: string
    condition?: (data: Record<string, unknown>) => boolean
  }
}

function dataFields(fields: Field[]): DataField[] {
  return fields.flatMap((f) => {
    if (f.type === 'row' || f.type === 'collapsible') return dataFields(f.fields)
    return 'name' in f ? [f as DataField] : []
  })
}

const FIELDS = dataFields(Reports.fields)
const field = (name: string) => FIELDS.find((f) => f.name === name)!

const request = () => ({
  t: (key: string) => key,
  payload: { collections: {}, config: { collections: [] } },
  context: {},
})

const hooks = Reports.hooks?.beforeValidate ?? []
const guards = Reports.hooks?.beforeChange ?? []

/** Runs the collection's beforeValidate hooks, as Payload does. */
async function prepare(
  data: Record<string, unknown>,
  operation: 'create' | 'update' = 'create',
  originalDoc?: Record<string, unknown>,
) {
  let result = data
  for (const hook of hooks) {
    result = (await hook({
      data: result,
      operation,
      originalDoc,
      context: {},
      req: request(),
    } as never)) as Record<string, unknown>
  }
  return result
}

const report = (overrides: Record<string, unknown> = {}) => ({
  kind: 'wrong-fact',
  details: 'The deadline on the original posting is 14 November.',
  email: null,
  locale: 'en',
  job: 7,
  itemUrl: '/en/jobs/phd-position-in-astrocyte-neuron-signalling-test1/',
  status: 'new',
  ...overrides,
})

describe('Reports: access', () => {
  it('is created only through the local API, by the form', () => {
    expect(Reports.access?.create?.({ req: { user: { id: 1 } } } as never)).toBe(false)
    expect(Reports.access?.create?.({ req: {} } as never)).toBe(false)
  })

  it('is deleted only by signed-in editors (to answer data requests)', () => {
    expect(Reports.access?.delete?.({ req: { user: { id: 1 } } } as never)).toBe(true)
    expect(Reports.access?.delete?.({ req: { user: null } } as never)).toBe(false)
  })

  it('leaves reading and handling to signed-in editors (Payload’s default)', () => {
    expect(Reports.access?.read).toBeUndefined()
    expect(Reports.access?.update).toBeUndefined()
  })

  it('keeps what the person sent unchanged by editors', () => {
    for (const name of ['kind', 'job', 'institution', 'itemUrl', 'details', 'email', 'locale']) {
      expect(field(name).access?.update?.({}), name).toBe(false)
      expect(field(name).admin?.readOnly, name).toBe(true)
    }
    // Also for code that bypasses access control.
    expect(guards).toHaveLength(1)
  })

  it('lets editors set the status, the action and their note', () => {
    for (const name of ['status', 'action', 'actionNote']) {
      expect(field(name).access?.update, name).toBeUndefined()
    }
  })

  it('sets the dates by code only', () => {
    for (const name of ['createdAt', 'respondBy', 'closedAt', 'purgeAt', 'ackSentAt']) {
      expect(field(name).access?.create?.(), name).toBe(false)
      expect(field(name).access?.update?.({}), name).toBe(false)
    }
  })
})

describe('Reports: personal data in the admin', () => {
  it('shows the email address, the details and the note in no list column', () => {
    expect(Reports.admin?.defaultColumns).toEqual([
      'kind',
      'status',
      'respondBy',
      'job',
      'institution',
      'createdAt',
    ])
    for (const name of ['email', 'details', 'actionNote']) {
      expect(field(name).admin?.disableListColumn, name).toBe(true)
    }
    // The list loads only the columns it shows, so it never sends them to the browser.
    expect(Reports.admin?.enableListViewSelectAPI).toBe(true)
  })

  it('never loads them into the list, even when a link or a saved preference asks for them', async () => {
    const [hook] = Reports.hooks?.beforeOperation ?? []
    const read = (select: Record<string, boolean> | undefined, overrideAccess: boolean) =>
      hook!({ args: { select }, operation: 'read', overrideAccess, req: {} } as never)
    // The admin list: ?columns=["email","details","actionNote","kind"].
    expect(await read({ kind: true, email: true, details: true, actionNote: true }, false)).toEqual(
      { select: { kind: true } },
    )
    // The document view asks for no fields, and server code bypasses access control.
    expect(await read(undefined, false)).toEqual({ select: undefined })
    expect(await read({ email: true }, true)).toEqual({ select: { email: true } })
  })

  it('keeps no versions, which would copy the email address and details', () => {
    expect(Reports.versions).toBeUndefined()
  })

  it('sits with the review queue under its own name', () => {
    expect(Reports.admin?.group).toBe('Review queue')
    expect(Reports.labels?.plural).toBe('Reports and requests')
  })
})

describe('Reports: the item', () => {
  it('links a job or an institution, which the database clears when it is deleted', () => {
    expect(field('job')).toMatchObject({ type: 'relationship', relationTo: 'jobs' })
    expect(field('institution')).toMatchObject({
      type: 'relationship',
      relationTo: 'institutions',
    })
    // Neither is required, so ON DELETE SET NULL can clear it; the page's address stays.
    expect((field('job') as { required?: boolean }).required).toBeFalsy()
    expect((field('institution') as { required?: boolean }).required).toBeFalsy()
  })

  it('shows the one the report names in the same place: the job, or the institution', () => {
    const shown = (name: string, data: Record<string, unknown>) =>
      field(name).admin?.condition?.(data) ?? true
    expect(shown('job', { job: 7 })).toBe(true)
    expect(shown('institution', { job: 7 })).toBe(false)
    expect(shown('job', { institution: 12 })).toBe(false)
    expect(shown('institution', { institution: 12 })).toBe(true)
    // Other reports show the job field, empty, as before.
    expect(shown('job', {})).toBe(true)
    expect(shown('institution', {})).toBe(false)
  })

  it('refuses a kind that only a job can have for an institution, as the form does', async () => {
    const validate = field('kind').validate!
    const { options, required } = field('kind') as { options?: unknown; required?: boolean }
    const run = (value: string, data: Record<string, unknown>) =>
      validate(value, { options, required, hasMany: false, data, req: request() })
    for (const kind of ['closed', 'not-employer']) {
      expect(await run(kind, { institution: 12 }), kind).toBe(
        'This kind is for reports about a job only, not about an institution.',
      )
      expect(await run(kind, { job: 7 }), kind).toBe(true)
      expect(await run(kind, {}), kind).toBe(true)
    }
    for (const kind of ['wrong-fact', 'broken-link', 'personal-rights', 'other']) {
      expect(await run(kind, { institution: 12 }), kind).toBe(true)
    }
  })
})

describe('Reports: rules', () => {
  it('needs an email address for a personal-rights request, and one that can be delivered', async () => {
    const validate = field('email').validate!
    const options = (data: Record<string, unknown>) => ({ data, req: request() })
    expect(await validate(null, options({ kind: 'personal-rights' }))).toMatch(
      /needs an email address/,
    )
    expect(await validate(null, options({ kind: 'wrong-fact' }))).toBe(true)
    expect(await validate('someone@example.org', options({ kind: 'personal-rights' }))).toBe(true)
    expect(await validate(`${'a'.repeat(250)}@example.org`, options({ kind: 'other' }))).toBe(
      'This email address is too long.',
    )
  })

  /** What Payload passes to a select field's validate function besides the data. */
  const selectOptions = (name: string) => {
    const { options, required } = field(name) as { options?: unknown; required?: boolean }
    return { options, required, hasMany: false }
  }

  it('needs an action to close a report', async () => {
    const validate = field('action').validate!
    const options = (data: Record<string, unknown>) => ({
      ...selectOptions('action'),
      data,
      req: request(),
    })
    expect(await validate(null, options({ status: 'closed' }))).toBe(
      'Choose what was done before closing the report.',
    )
    expect(await validate(null, options({ status: 'in-progress' }))).toBe(true)
    expect(await validate('corrected', options({ status: 'closed' }))).toBe(true)
  })

  it('keeps a personal-rights request New until it is answered, as the dashboard counts it', () => {
    // The dashboard's 24-hour count holds the personal-rights requests that are still New.
    const now = new Date()
    for (const where of [personalRightsDueWhere(now), personalRightsOverdueWhere(now)]) {
      expect(where.and).toContainEqual({ status: { equals: 'new' } })
    }
    // So "In progress" must not mean only "started checking" for them: the texts say so.
    expect(field('status').admin?.description).toMatch(
      /a personal-rights request stays New until you have answered the person/,
    )
    expect(String(Reports.admin?.description)).toMatch(
      /In progress once you have answered the person or started checking \(a personal-rights request only once you have answered the person/,
    )
  })

  it('never goes back to New once handled', async () => {
    const validate = field('status').validate!
    const options = (previousValue: unknown, operation = 'update') => ({
      ...selectOptions('status'),
      data: {},
      operation,
      previousValue,
      req: request(),
    })
    expect(await validate('new', options(undefined, 'create'))).toBe(true)
    expect(await validate('in-progress', options('new'))).toBe(true)
    expect(await validate('new', options('closed'))).toMatch(/does not go back to New/)
    expect(await validate('in-progress', options('closed'))).toBe(true)
  })

  it('refuses details longer than the form allows', () => {
    expect((field('details') as { maxLength?: number }).maxLength).toBe(2000)
  })
})

describe('Reports: dates', () => {
  it('sets the time received and the answer due: 24 hours for personal rights', async () => {
    const before = Date.now()
    const data = await prepare(report({ kind: 'personal-rights', email: ' someone@example.org ' }))
    const received = Date.parse(data.createdAt as string)
    expect(received).toBeGreaterThanOrEqual(before)
    expect(Date.parse(data.respondBy as string) - received).toBe(24 * 3_600_000)
    expect(data.email).toBe('someone@example.org')
    expect(data).toMatchObject({ closedAt: null, purgeAt: null })
  })

  it('gives other reports 30 days', async () => {
    const data = await prepare(report())
    const received = Date.parse(data.createdAt as string)
    expect(Date.parse(data.respondBy as string) - received).toBe(30 * 86_400_000)
  })

  it('keeps the answer date from when the report arrived', async () => {
    const saved = {
      ...report({ kind: 'personal-rights', email: 'someone@example.org' }),
      createdAt: '2026-09-28T10:00:00.000Z',
      respondBy: '2026-09-29T10:00:00.000Z',
    }
    const data = await prepare({ status: 'in-progress' }, 'update', saved)
    expect(data.respondBy).toBe('2026-09-29T10:00:00.000Z')
    // What the person sent is filled in from the saved report (fixed fields).
    expect(data).toMatchObject({ kind: 'personal-rights', email: 'someone@example.org', job: 7 })
  })

  it('records when it is closed and deletes it 2 years later; reopening clears both', async () => {
    const saved = { ...report(), createdAt: '2026-09-28T10:00:00.000Z', status: 'in-progress' }
    const closed = await prepare({ status: 'closed', action: 'corrected' }, 'update', saved)
    const closedAt = new Date(closed.closedAt as string)
    expect(Date.now() - closedAt.getTime()).toBeLessThan(5000)
    const purge = new Date(closed.purgeAt as string)
    expect(purge.getUTCFullYear() - closedAt.getUTCFullYear()).toBe(2)
    const reopened = await prepare({ status: 'in-progress' }, 'update', {
      ...saved,
      ...closed,
    })
    expect(reopened).toMatchObject({ closedAt: null, purgeAt: null })
  })

  it('refuses a change to what the person sent, also from code', async () => {
    const saved = { ...report(), id: 3 }
    const guard = guards[0]!
    expect(() =>
      guard({
        data: { details: 'Changed by someone else.' },
        originalDoc: saved,
        operation: 'update',
        req: request(),
      } as never),
    ).toThrow()
  })
})
