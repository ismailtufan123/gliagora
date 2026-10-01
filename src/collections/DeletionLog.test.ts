import { afterEach, describe, expect, it, vi } from 'vitest'

import { RETENTION } from '@/lib/retention/context'

import { DeletionLog, logDeletions } from './DeletionLog'
import { FAKE_DATA, Jobs } from './Jobs'
import { Reports } from './Reports'
import { Submissions } from './Submissions'

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Runs a logging hook as Payload does after deleting record 42. */
async function deleted(context: Record<string, unknown> = {}) {
  const create = vi.fn(async () => ({}))
  const req = { payload: { create }, context }
  await logDeletions('submissions')({ id: 42, req, context } as never)
  return { create, req }
}

describe('the deletion log', () => {
  it('holds record IDs only: no field for personal data', () => {
    const names = DeletionLog.fields.map((field) => ('name' in field ? field.name : ''))
    expect(names).toEqual(['targetCollection', 'targetId', 'action', 'at'])
  })

  it('logs a suggestion or report deleted by an editor or a data request, in its transaction', async () => {
    const { create, req } = await deleted()
    expect(create).toHaveBeenCalledWith({
      collection: 'deletion-log',
      data: {
        targetCollection: 'submissions',
        targetId: 42,
        action: 'delete',
        at: expect.any(String),
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
  })

  it('leaves out the retention task’s deletions, which repeat themselves after a restore', async () => {
    expect((await deleted({ retention: RETENTION })).create).not.toHaveBeenCalled()
  })

  it('leaves out removing the fake data, except where it would be ignored (production)', async () => {
    expect((await deleted({ fakeData: FAKE_DATA })).create).not.toHaveBeenCalled()
    vi.stubEnv('PAYLOAD_JOBS_AUTORUN', 'true')
    expect((await deleted({ fakeData: FAKE_DATA })).create).toHaveBeenCalledTimes(1)
    // A context value from a request cannot be the symbol.
    vi.unstubAllEnvs()
    expect((await deleted({ retention: 'retention' })).create).toHaveBeenCalledTimes(1)
  })

  it('is written for suggestions and reports', () => {
    expect(Submissions.hooks?.afterDelete).toHaveLength(1)
    expect(Reports.hooks?.afterDelete).toHaveLength(1)
  })
})

describe('jobs: saved items go with the job', () => {
  it('deletes the saved items of a deleted job through the deletion’s own request', async () => {
    const hooks = Jobs.hooks?.beforeDelete ?? []
    expect(hooks).toHaveLength(2)
    const forget = hooks[1]!
    const deleteMany = vi.fn(async () => {})
    const req = { payload: { db: { deleteMany } }, context: {} }
    await forget({ id: 9, req, context: {} } as never)
    expect(deleteMany).toHaveBeenCalledWith({
      collection: 'saved-items',
      where: { job: { equals: 9 } },
      req,
    })
  })
})
