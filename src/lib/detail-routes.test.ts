import { describe, expect, it } from 'vitest'

import { type DetailLookup, matchDetailRoute, resolveDetailRoute } from './detail-routes'

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
  ])('marks %s as a URL that names no record', (path) => {
    expect(matchDetailRoute(path)).toEqual({ kind: 'invalid' })
  })

  it.each([
    '/en/subfields/wp-login.php',
    '/en/subfields/astrology.html',
    '/en/institutions/caltech-05dxps055.html',
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
  ])('ignores %s', (path) => {
    expect(matchDetailRoute(path)).toBeNull()
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
