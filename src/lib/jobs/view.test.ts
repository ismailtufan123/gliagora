import { describe, expect, it } from 'vitest'

import { jobsHref } from '@/lib/filters/jobs'

import { type JobDoc, rowTags, subfieldHubPath, toJobCard, toJobDetail } from './view'

const term = (id: number, slug: string, label = slug) => ({ id, slug, label })

const doc: JobDoc = {
  id: 7,
  title: 'PhD position in astrocyte signalling',
  slug: 'phd-position-in-astrocyte-signalling',
  shortId: 'k3f9a',
  status: 'published',
  originalLanguage: 'de',
  institution: {
    id: 3,
    name: 'Karolinska Institutet',
    slug: 'karolinska-institutet',
    rorId: '056d84691',
    shortId: null,
  },
  city: 'Solna',
  country: { name: 'Sweden' },
  positionType: term(1, 'phd', 'PhD'),
  careerStages: [term(2, 'phd-candidate', 'PhD candidate')],
  subfields: [term(10, 'glia', 'Glial biology'), term(11, 'molecular-cellular', 'Molecular')],
  methods: [term(20, 'optical-imaging', 'Optical imaging'), 21],
  modelSystems: [term(30, 'mouse', 'Mouse')],
  deadlineKind: 'fixed',
  deadlineDate: '2026-11-14T12:00:00.000Z',
  deadlineTz: 'Europe/Stockholm',
  deadlineAt: '2026-11-14T23:00:00.000Z',
  originalUrl: 'https://careers.example.org/jobs/1',
  startText: '  By agreement ',
  summary: 'A three-year project.',
  verifiedAt: '2026-09-24T12:00:00.000Z',
}

describe('toJobCard and toJobDetail', () => {
  it('keep the public facts as plain values', () => {
    const card = toJobCard(doc)
    expect(card).toMatchObject({
      id: 7,
      path: '/en/jobs/phd-position-in-astrocyte-signalling-k3f9a/',
      originalLanguage: 'de',
      institution: {
        id: 3,
        name: 'Karolinska Institutet',
        path: '/en/institutions/karolinska-institutet-056d84691/',
        urlId: '056d84691',
      },
      city: 'Solna',
      country: 'Sweden',
      positionType: { slug: 'phd', label: 'PhD' },
      deadlineTz: 'Europe/Stockholm',
    })
    // A term that was not populated (only its ID) is left out.
    expect(card?.methods.map((method) => method.slug)).toEqual(['optical-imaging'])
    expect(card).not.toHaveProperty('summary')
  })

  it('add the detail facts for the job page', () => {
    expect(toJobDetail(doc)).toMatchObject({
      careerStages: [{ slug: 'phd-candidate', label: 'PhD candidate' }],
      startText: 'By agreement',
      summary: 'A three-year project.',
      verifiedDay: '2026-09-24',
    })
  })

  it('use the short ID of an institution without a ROR ID, also as its list filter', () => {
    const card = toJobCard({
      ...doc,
      institution: { id: 4, name: 'Brain Lab', slug: 'brain-lab', rorId: null, shortId: 'b7c2d' },
    })
    expect(card?.institution).toMatchObject({
      path: '/en/institutions/brain-lab-b7c2d/',
      urlId: 'b7c2d',
    })
    // PLAN §2.4: `institution` takes a ROR ID, or the short ID of an institution without one.
    expect(jobsHref({ institution: [card?.institution?.urlId ?? ''] })).toBe(
      '/en/jobs/?institution=b7c2d',
    )
  })

  it('keep whether a term is retired; unset counts as active', () => {
    const card = toJobCard({
      ...doc,
      subfields: [
        { id: 10, slug: 'glia', label: 'Glial biology', isActive: true },
        { id: 12, slug: 'neuroethics', label: 'Neuroethics', isActive: false },
        { id: 13, slug: 'cognitive', label: 'Cognitive', isActive: null },
      ],
    })
    expect(card?.subfields.map((term) => [term.slug, term.isActive])).toEqual([
      ['glia', true],
      ['neuroethics', false],
      ['cognitive', true],
    ])
  })

  it('skip a job without the address every saved job has', () => {
    expect(toJobCard({ ...doc, shortId: null })).toBeNull()
    expect(toJobDetail({ ...doc, slug: null })).toBeNull()
  })
})

describe('rowTags', () => {
  it('shows up to three tags, subfields first, and counts the rest', () => {
    const card = toJobCard(doc)!
    const { shown, more } = rowTags(card)
    expect(shown.map((tag) => tag.slug)).toEqual(['glia', 'molecular-cellular', 'optical-imaging'])
    expect(more).toBe(1)
    expect(rowTags({ ...card, methods: [], modelSystems: [] })).toMatchObject({ more: 0 })
  })
})

describe('subfieldHubPath', () => {
  it('links an active subfield to its hub, and a retired one (410) nowhere', () => {
    const glia = { id: 10, slug: 'glia', label: 'Glial biology', isActive: true }
    expect(subfieldHubPath(glia)).toBe('/en/subfields/glia/')
    expect(subfieldHubPath({ ...glia, isActive: false })).toBeNull()
  })
})
