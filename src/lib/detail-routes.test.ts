import { describe, expect, it } from 'vitest'

import {
  type DetailLookup,
  type JobRecord,
  JOBS_RESERVED_SEGMENTS,
  matchDetailRoute,
  resolveDetailRoute,
} from './detail-routes'

describe('matchDetailRoute', () => {
  it.each([
    [
      '/en/institutions/california-institute-of-technology-05dxps055/',
      { kind: 'institution', slug: 'california-institute-of-technology', id: '05dxps055' },
    ],
    ['/en/institutions/05dxps055/', { kind: 'institution', slug: null, id: '05dxps055' }],
    ['/en/institutions/brain-lab-k3f9a/', { kind: 'institution', slug: 'brain-lab', id: 'k3f9a' }],
    ['/en/institutions/lab-2-k3f9a/', { kind: 'institution', slug: 'lab-2', id: 'k3f9a' }],
    ['/en/subfields/glia/', { kind: 'subfield', slug: 'glia' }],
    ['/en/subfields/systems-circuits/', { kind: 'subfield', slug: 'systems-circuits' }],
    [
      '/en/jobs/phd-position-in-glia-k3f9a/',
      { kind: 'job', slug: 'phd-position-in-glia', shortId: 'k3f9a' },
    ],
    ['/en/jobs/k3f9a/', { kind: 'job', slug: null, shortId: 'k3f9a' }],
    ['/en/jobs/k3f9a', { kind: 'job', slug: null, shortId: 'k3f9a' }],
    ['/en/jobs/postdoc-2-test1/', { kind: 'job', slug: 'postdoc-2', shortId: 'test1' }],
  ])('%s', (path, route) => {
    expect(matchDetailRoute(path)).toEqual(route)
  })

  it.each([
    '/en/institutions/California-05dxps055/',
    '/en/institutions/x-05dxps0555/',
    '/en/institutions/-05dxps055/',
    '/en/institutions/x--05dxps055/',
    '/en/subfields/Glia/',
    '/en/subfields/glia_x/',
    '/en/subfields/%67lia/',
    '/en/jobs/PhD-k3f9a/',
    '/en/jobs/phd-k3f9/',
    '/en/jobs/phd-k3f9aa/',
    // i, l, o and u are not in the short-ID alphabet.
    '/en/jobs/phd-k3f9i/',
    '/en/jobs/phd--k3f9a/',
    '/en/jobs/-k3f9a/',
    '/en/jobs/phd/',
  ])('marks %s as a URL that names no record', (path) => {
    expect(matchDetailRoute(path)).toEqual({ kind: 'invalid' })
  })

  it.each([
    '/en/subfields/wp-login.php',
    '/en/subfields/astrology.html',
    '/en/institutions/caltech-05dxps055.html',
    '/en/jobs/rss.xml',
  ])('marks %s, which Next.js leaves without a trailing slash, as naming no record', (path) => {
    expect(matchDetailRoute(path)).toEqual({ kind: 'invalid' })
  })

  it.each([
    '/en/',
    '/en/subfields/',
    '/en/institutions/',
    '/en/jobs/',
    '/tr/subfields/glia/',
    '/en/subfields/glia/extra/',
    '/tr/jobs/phd-k3f9a/',
    '/en/jobs/phd-k3f9a/extra/',
  ])('ignores %s', (path) => {
    expect(matchDetailRoute(path)).toBeNull()
  })

  it('leaves the reserved names under /en/jobs/ to their own routes: the jobs feed', () => {
    expect(JOBS_RESERVED_SEGMENTS.has('feed.xml')).toBe(true)
    expect(matchDetailRoute('/en/jobs/feed.xml')).toBeNull()
    expect(matchDetailRoute('/en/jobs/feed.xml/')).toBeNull()
  })
})

describe('resolveDetailRoute', () => {
  const lookup: DetailLookup = {
    institution: async (id) =>
      ({
        '05dxps055': { slug: 'california-institute-of-technology', id: '05dxps055' },
        // Added by hand, later given a ROR ID: the short ID still finds it.
        k3f9a: { slug: 'example-lab', id: '02h1nk258' },
        '02h1nk258': { slug: 'example-lab', id: '02h1nk258' },
      })[id] ?? null,
    subfield: async (slug) =>
      ({ glia: { isActive: true }, retired: { isActive: false } })[slug] ?? null,
    job: async () => null,
  }
  const resolve = (path: string) => {
    const route = matchDetailRoute(path)
    if (!route) throw new Error(`${path} is not a detail route`)
    return resolveDetailRoute(route, lookup)
  }

  it('renders an institution at its canonical URL', async () => {
    expect(await resolve('/en/institutions/california-institute-of-technology-05dxps055/')).toEqual(
      { action: 'render' },
    )
  })

  it.each(['/en/institutions/05dxps055/', '/en/institutions/caltech-05dxps055/'])(
    'redirects %s to the canonical URL',
    async (path) => {
      expect(await resolve(path)).toEqual({
        action: 'redirect',
        to: '/en/institutions/california-institute-of-technology-05dxps055/',
      })
    },
  )

  it('moves an institution from its short-ID address to its ROR address', async () => {
    expect(await resolve('/en/institutions/example-lab-k3f9a/')).toEqual({
      action: 'redirect',
      to: '/en/institutions/example-lab-02h1nk258/',
    })
    expect(await resolve('/en/institutions/example-lab-02h1nk258/')).toEqual({ action: 'render' })
  })

  it('answers 404 for an unknown or malformed institution ID', async () => {
    expect(await resolve('/en/institutions/somewhere-056d84691/')).toEqual({ action: 'notFound' })
    expect(await resolve('/en/institutions/Caltech-05dxps055/')).toEqual({ action: 'notFound' })
  })

  it('renders an active subfield, 410 for a retired one and 404 for an unknown one', async () => {
    expect(await resolve('/en/subfields/glia/')).toEqual({ action: 'render' })
    expect(await resolve('/en/subfields/retired/')).toEqual({ action: 'gone' })
    expect(await resolve('/en/subfields/astrology/')).toEqual({ action: 'notFound' })
  })
})

describe('resolveDetailRoute for jobs (PLAN §2.5)', () => {
  const HOUR = 3_600_000
  const DAY = 24 * HOUR
  const now = new Date('2026-10-01T12:00:00.000Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const ahead = (ms: number) => new Date(now.getTime() + ms).toISOString()
  const PATH = '/en/jobs/phd-in-glia-k3f9a/'

  const resolveJob = (job: Partial<JobRecord> | null, path = PATH, at = now) => {
    const lookup: DetailLookup = {
      institution: async () => null,
      subfield: async () => null,
      job: async (shortId) =>
        job && shortId === 'k3f9a'
          ? {
              slug: 'phd-in-glia',
              shortId: 'k3f9a',
              status: 'published',
              deadlineKind: 'fixed',
              deadlineAt: ahead(20 * DAY),
              ...job,
            }
          : null,
    }
    const route = matchDetailRoute(path)
    if (!route) throw new Error(`${path} is not a detail route`)
    return resolveDetailRoute(route, lookup, at)
  }

  it('renders an open job at its canonical URL', async () => {
    expect(await resolveJob({})).toEqual({ action: 'render' })
    expect(await resolveJob({ deadlineKind: 'rolling', deadlineAt: null })).toEqual({
      action: 'render',
    })
  })

  it('answers 404 for an unknown short ID and for a URL that cannot name a job', async () => {
    expect(await resolveJob(null)).toEqual({ action: 'notFound' })
    expect(await resolveJob({}, '/en/jobs/phd-in-glia-k3f9b/')).toEqual({ action: 'notFound' })
    expect(await resolveJob({}, '/en/jobs/PhD-k3f9a/')).toEqual({ action: 'notFound' })
  })

  it('answers 404 for drafts and jobs in review, which were never public', async () => {
    expect(await resolveJob({ status: 'draft' })).toEqual({ action: 'notFound' })
    expect(await resolveJob({ status: 'in_review' })).toEqual({ action: 'notFound' })
    // Also without the slug: an unpublished job's address is not revealed by a redirect.
    expect(await resolveJob({ status: 'draft' }, '/en/jobs/k3f9a/')).toEqual({
      action: 'notFound',
    })
  })

  it('answers 410 for a withdrawn job at once, whatever the slug', async () => {
    const withdrawn = { status: 'withdrawn' as const, withdrawnAt: ago(60_000) }
    expect(await resolveJob(withdrawn)).toEqual({ action: 'gone' })
    expect(await resolveJob(withdrawn, '/en/jobs/old-title-k3f9a/')).toEqual({ action: 'gone' })
    expect(await resolveJob({ status: 'withdrawn', withdrawnAt: null })).toEqual({
      action: 'gone',
    })
  })

  it('renders a published job whose deadline passed an hour ago, before the hourly expiry', async () => {
    expect(await resolveJob({ deadlineAt: ago(HOUR) })).toEqual({ action: 'render' })
  })

  it('renders a closed job for 30 days and answers 410 from exactly 30 days after it closed', async () => {
    const closed = ago(30 * DAY)
    const expired = { status: 'expired' as const, deadlineAt: closed, expiredAt: closed }
    expect(await resolveJob(expired)).toEqual({ action: 'gone' })
    expect(await resolveJob(expired, PATH, new Date(now.getTime() - 1))).toEqual({
      action: 'render',
    })
    const later = ago(29 * DAY)
    expect(await resolveJob({ ...expired, deadlineAt: later, expiredAt: later })).toEqual({
      action: 'render',
    })
  })

  it('answers 410 for a published job 30 days after its deadline, even if never marked expired', async () => {
    expect(await resolveJob({ deadlineAt: ago(30 * DAY) })).toEqual({ action: 'gone' })
    expect(await resolveJob({ deadlineAt: ago(30 * DAY - 1) })).toEqual({ action: 'render' })
  })

  it('counts the 30 days from the expiry when a position was filled before its deadline', async () => {
    const filled = { status: 'expired' as const, deadlineAt: ahead(10 * DAY) }
    expect(await resolveJob({ ...filled, expiredAt: ago(31 * DAY) })).toEqual({ action: 'gone' })
    expect(await resolveJob({ ...filled, expiredAt: ago(5 * DAY) })).toEqual({ action: 'render' })
    const rolling = { status: 'expired' as const, deadlineKind: 'rolling' as const }
    expect(await resolveJob({ ...rolling, deadlineAt: null, expiredAt: ago(31 * DAY) })).toEqual({
      action: 'gone',
    })
  })

  it('redirects a URL with a missing or outdated slug to the canonical URL', async () => {
    const canonical = { action: 'redirect', to: PATH }
    expect(await resolveJob({}, '/en/jobs/k3f9a/')).toEqual(canonical)
    expect(await resolveJob({}, '/en/jobs/phd-in-glial-biology-k3f9a/')).toEqual(canonical)
    // A closed job that still renders is redirected too.
    expect(await resolveJob({ status: 'expired', expiredAt: ago(DAY) }, '/en/jobs/k3f9a/')).toEqual(
      canonical,
    )
  })
})
