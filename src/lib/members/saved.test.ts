import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type SavableJob,
  type ToggleDeps,
  atSaveControl,
  handleSaveToggle,
  isSavable,
  saveAfterSignIn,
  signInToSave,
} from './saved'
import type { SaveOutcome } from './store'

// Saving positions (src/lib/members/saved.ts): the route behind every Save button, and saving the
// position a visitor pressed Save on before signing in.

const NOW = new Date('2026-10-01T12:00:00Z')
const DAY = 86_400_000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY)

const JOBS: Record<string, SavableJob> = {
  /** Open, with a rolling deadline. */
  test1: { id: 1, status: 'published', deadlineKind: 'rolling' },
  /** Closed 10 days ago: still public. */
  test4: {
    id: 4,
    status: 'expired',
    deadlineKind: 'fixed',
    deadlineAt: ago(10),
    expiredAt: ago(10),
  },
  /** Closed 45 days ago: gone. */
  test5: {
    id: 5,
    status: 'expired',
    deadlineKind: 'fixed',
    deadlineAt: ago(45),
    expiredAt: ago(45),
  },
  /** Withdrawn yesterday: gone at once. */
  test6: { id: 6, status: 'withdrawn', deadlineKind: 'rolling', withdrawnAt: ago(1) },
  /** Never published. */
  test7: { id: 7, status: 'draft', deadlineKind: 'rolling' },
}

const MEMBER = 42
const JOB_PAGE = '/en/jobs/phd-position-in-astrocyte-neuron-signalling-test1/'

function deps(overrides: Partial<ToggleDeps> = {}) {
  const save = vi.fn(async (): Promise<SaveOutcome> => 'saved')
  const unsave = vi.fn(async () => true)
  const value: ToggleDeps = {
    now: NOW,
    env: {},
    member: async () => MEMBER,
    job: async (shortId) => JOBS[shortId] ?? null,
    save,
    unsave,
    ...overrides,
  }
  return { deps: value, save: value.save as typeof save, unsave: value.unsave as typeof unsave }
}

/** A POST as a Save form sends it, from this computer's site (no SERVER_URL). */
function post(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request('http://0.0.0.0:3000/en/account/saved/toggle/', {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: {
      host: 'localhost:3000',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
  })
}

const JSON_ACCEPT = { accept: 'application/json' }
const saving = (item = 'job:test1', back = '/en/jobs/?type=phd') => ({ item, saved: '1', back })
const removing = (item = 'job:test1', back = '/en/jobs/?type=phd') => ({ item, saved: '0', back })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleSaveToggle', () => {
  it('saves a job and returns to its row, never stored', async () => {
    const { deps: d, save } = deps()
    const response = await handleSaveToggle(post(saving()), d)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/en/jobs/?type=phd#job-test1')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(save).toHaveBeenCalledWith(MEMBER, 1)
  })

  it('answers { saved } with JavaScript', async () => {
    const { deps: d } = deps()
    const response = await handleSaveToggle(post(saving(), JSON_ACCEPT), d)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ saved: true })
    const removed = await handleSaveToggle(post(removing(), JSON_ACCEPT), deps().deps)
    expect(await removed.json()).toEqual({ saved: false })
  })

  it('returns to the Save control of the job’s own page', async () => {
    const response = await handleSaveToggle(post(saving('job:test1', JOB_PAGE)), deps().deps)
    expect(response.headers.get('location')).toBe(`${JOB_PAGE}#save`)
    // Another job's page has no control of this job: its row, if any.
    const other = await handleSaveToggle(post(saving('job:test4', JOB_PAGE)), deps().deps)
    expect(other.headers.get('location')).toBe(`${JOB_PAGE}#job-test4`)
  })

  it('saves a job closed less than 30 days ago', async () => {
    const { deps: d, save } = deps()
    const response = await handleSaveToggle(post(saving('job:test4')), d)
    expect(response.headers.get('location')).toBe('/en/jobs/?type=phd#job-test4')
    expect(save).toHaveBeenCalledWith(MEMBER, 4)
  })

  it.each(['test5', 'test6', 'test7', 'zzzzz'])(
    'refuses to save %s, which is not public, on the saved page',
    async (shortId) => {
      const { deps: d, save } = deps()
      const response = await handleSaveToggle(post(saving(`job:${shortId}`)), d)
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe('/en/account/saved/?error=not-public#outcome')
      const asJson = await handleSaveToggle(post(saving(`job:${shortId}`), JSON_ACCEPT), d)
      expect(asJson.status).toBe(409)
      expect(await asJson.json()).toEqual({ error: 'not-public' })
      expect(save).not.toHaveBeenCalled()
    },
  )

  it('says so on the saved page when 500 are saved', async () => {
    const full = deps({ save: vi.fn(async (): Promise<SaveOutcome> => 'full') }).deps
    const response = await handleSaveToggle(post(saving()), full)
    expect(response.headers.get('location')).toBe('/en/account/saved/?error=saved-full#outcome')
    const asJson = await handleSaveToggle(post(saving(), JSON_ACCEPT), full)
    expect(asJson.status).toBe(409)
    expect(await asJson.json()).toEqual({ error: 'saved-full' })
  })

  it('saving twice changes nothing: the form sends the state it wants', async () => {
    const already = deps({ save: vi.fn(async (): Promise<SaveOutcome> => 'already') }).deps
    const response = await handleSaveToggle(post(saving(), JSON_ACCEPT), already)
    expect(await response.json()).toEqual({ saved: true })
  })

  it.each(['test4', 'test5', 'test6', 'test7'])(
    'removes %s whatever its state',
    async (shortId) => {
      const { deps: d, unsave } = deps()
      const response = await handleSaveToggle(post(removing(`job:${shortId}`)), d)
      expect(response.headers.get('location')).toBe(`/en/jobs/?type=phd#job-${shortId}`)
      expect(unsave).toHaveBeenCalledWith(MEMBER, JOBS[shortId]!.id)
    },
  )

  it('removing a job that no longer exists changes nothing and is no error', async () => {
    const { deps: d, unsave } = deps()
    const response = await handleSaveToggle(post(removing('job:zzzzz'), JSON_ACCEPT), d)
    expect(await response.json()).toEqual({ saved: false })
    expect(unsave).not.toHaveBeenCalled()
  })

  it('removed on the saved page, whose row is then gone, says so there', async () => {
    const response = await handleSaveToggle(
      post(removing('job:test6', '/en/account/saved/?page=2')),
      deps().deps,
    )
    expect(response.headers.get('location')).toBe('/en/account/saved/?page=2&done=removed#outcome')
    const first = await handleSaveToggle(
      post(removing('job:test6', '/en/account/saved/')),
      deps().deps,
    )
    expect(first.headers.get('location')).toBe('/en/account/saved/?done=removed#outcome')
  })

  it.each([
    ['https://evil.example.org/en/jobs/', 'another site'],
    ['//evil.example.org/en/jobs/', 'another host'],
    ['/admin/', 'the admin'],
    ['/en/sign-in/', 'sign-in'],
    ['', 'nothing'],
  ])('returns to the saved page instead of %j (%s)', async (back) => {
    const response = await handleSaveToggle(post(saving('job:test1', back)), deps().deps)
    expect(response.headers.get('location')).toBe('/en/account/saved/#job-test1')
  })

  it('signed out: to the sign-in page, which saves the job afterwards and comes back', async () => {
    const { deps: d, save } = deps({ member: async () => null })
    const response = await handleSaveToggle(post(saving()), d)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      '/en/sign-in/?next=%2Fen%2Fjobs%2F%3Ftype%3Dphd&save=job%3Atest1',
    )
    const asJson = await handleSaveToggle(post(saving(), JSON_ACCEPT), d)
    expect(asJson.status).toBe(401)
    expect(await asJson.json()).toEqual({
      signIn: '/en/sign-in/?next=%2Fen%2Fjobs%2F%3Ftype%3Dphd&save=job%3Atest1',
    })
    // A removal saves nothing afterwards.
    const removal = await handleSaveToggle(post(removing()), d)
    expect(removal.headers.get('location')).toBe('/en/sign-in/?next=%2Fen%2Fjobs%2F%3Ftype%3Dphd')
    expect(save).not.toHaveBeenCalled()
  })

  it.each([
    [{ 'sec-fetch-site': 'cross-site' }, 'from another site'],
    [{ 'sec-fetch-site': 'same-site' }, 'from a subdomain'],
    [{ 'sec-fetch-site': '', origin: 'null' }, 'with Origin null'],
    [{ host: 'evil.example.org' }, 'at a host that is not this site'],
  ])('refuses a POST %s (403)', async (headers, _case) => {
    const values = { ...headers } as Record<string, string>
    const request = post(saving(), values)
    // An empty value stands for a header the browser did not send.
    if (values['sec-fetch-site'] === '') request.headers.delete('sec-fetch-site')
    const { deps: d, save } = deps()
    const response = await handleSaveToggle(request, d)
    expect(response.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it.each([
    [{ item: 'job:TEST1', saved: '1' }, 'an item that is not a short ID'],
    [{ item: 'event:test1', saved: '1' }, 'another kind of item'],
    [{ item: 'job:test1', saved: 'yes' }, 'a state that is neither 1 nor 0'],
    [{ item: 'job:test1' }, 'no state'],
  ])('refuses %s, changing nothing', async (fields, _case) => {
    const { deps: d, save, unsave } = deps()
    const response = await handleSaveToggle(post(fields), d)
    expect(response.headers.get('location')).toBe('/en/account/saved/?error=failed#outcome')
    const asJson = await handleSaveToggle(post(fields, JSON_ACCEPT), d)
    expect(asJson.status).toBe(400)
    expect(save).not.toHaveBeenCalled()
    expect(unsave).not.toHaveBeenCalled()
  })

  it('a failure leads to the saved page with a reference, and the log names no values', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = deps({
      save: vi.fn(async (): Promise<SaveOutcome> => {
        throw new Error('Key (member_id, job_id)=(42, 1) violates something')
      }),
    }).deps
    const response = await handleSaveToggle(post(saving()), failing)
    expect(response.headers.get('location')).toMatch(
      /^\/en\/account\/saved\/\?error=failed&ref=[0-9A-F]{10}#outcome$/,
    )
    const asJson = await handleSaveToggle(post(saving(), JSON_ACCEPT), failing)
    expect(asJson.status).toBe(500)
    expect(await asJson.json()).toEqual({ error: 'failed' })
    const logged = log.mock.calls.flat().join(' ')
    expect(logged).toMatch(/Save failed \(reference [0-9A-F]{10}\)/)
    expect(logged).not.toContain('42')
    expect(logged).not.toContain('member_id')
  })
})

describe('saveAfterSignIn', () => {
  const store = (overrides: Partial<ToggleDeps> = {}) => deps(overrides)

  it('without a position to save: nothing, and sign-in goes where it would', async () => {
    const { deps: d, save } = store()
    expect(await saveAfterSignIn(d, MEMBER, null, '/en/jobs/')).toBeNull()
    expect(await saveAfterSignIn(d, MEMBER, 'job:il0ou', '/en/jobs/')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('saves a public position and returns to its Save control', async () => {
    const { deps: d, save } = store()
    expect(await saveAfterSignIn(d, MEMBER, 'job:test1', '/en/jobs/?type=phd')).toBe(
      '/en/jobs/?type=phd#job-test1',
    )
    expect(await saveAfterSignIn(d, MEMBER, 'job:test1', JOB_PAGE)).toBe(`${JOB_PAGE}#save`)
    expect(save).toHaveBeenCalledWith(MEMBER, 1)
    // Signing in that leads to the account anyway still saves, and says what it says there.
    expect(await saveAfterSignIn(d, MEMBER, 'job:test4', '/en/account/')).toBeNull()
    expect(save).toHaveBeenCalledWith(MEMBER, 4)
  })

  it('a position no longer public, or 500 saved: the saved page says why', async () => {
    const { deps: d, save } = store()
    expect(await saveAfterSignIn(d, MEMBER, 'job:test6', '/en/jobs/')).toBe(
      '/en/account/saved/?error=not-public#outcome',
    )
    expect(save).not.toHaveBeenCalled()
    const full = store({ save: vi.fn(async (): Promise<SaveOutcome> => 'full') }).deps
    expect(await saveAfterSignIn(full, MEMBER, 'job:test1', '/en/jobs/')).toBe(
      '/en/account/saved/?error=saved-full#outcome',
    )
  })

  it('a failure never undoes the sign-in: the saved page with a reference', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = store({
      job: async () => {
        throw new Error('connection refused')
      },
    }).deps
    expect(await saveAfterSignIn(failing, MEMBER, 'job:test1', '/en/jobs/')).toMatch(
      /^\/en\/account\/saved\/\?error=failed&ref=[0-9A-F]{10}#outcome$/,
    )
  })
})

describe('helpers', () => {
  it('signInToSave carries where to return and what to save', () => {
    expect(signInToSave('/en/jobs/?type=phd&page=2', { type: 'job', shortId: 'k3f9a' })).toBe(
      '/en/sign-in/?next=%2Fen%2Fjobs%2F%3Ftype%3Dphd%26page%3D2&save=job%3Ak3f9a',
    )
    expect(signInToSave('/en/jobs/', null)).toBe('/en/sign-in/?next=%2Fen%2Fjobs%2F')
    // Where sign-in leads anyway (a start of signing in without `next`, provider-routes.ts).
    expect(signInToSave('/en/account/', { type: 'job', shortId: 'k3f9a' })).toBe(
      '/en/sign-in/?save=job%3Ak3f9a',
    )
    expect(signInToSave('/en/account/', null)).toBe('/en/sign-in/')
  })

  it('atSaveControl names the row, or the control on the job’s own page', () => {
    expect(atSaveControl('/en/jobs/', 'test1')).toBe('/en/jobs/#job-test1')
    expect(atSaveControl(`${JOB_PAGE}`, 'test1')).toBe(`${JOB_PAGE}#save`)
    expect(atSaveControl('/en/jobs/test1/', 'test1')).toBe('/en/jobs/test1/#save')
  })

  it('isSavable: open, or closed less than 30 days ago', () => {
    expect(isSavable(JOBS.test1!, NOW)).toBe(true)
    expect(isSavable(JOBS.test4!, NOW)).toBe(true)
    expect(isSavable(JOBS.test5!, NOW)).toBe(false)
    expect(isSavable(JOBS.test6!, NOW)).toBe(false)
    expect(isSavable(JOBS.test7!, NOW)).toBe(false)
  })
})
