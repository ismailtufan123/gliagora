import { describe, expect, it } from 'vitest'

import { TAXONOMY_2026_09 } from '@/migrations/data/taxonomy-2026-09'

import { compileTerms, findMatches, fold } from './match'
import { neuroscienceCheck } from './neuroscience'
import { noSuggestions, suggestTags } from './suggest'

// The seeded taxonomy (M3) stands in for the database's terms.
const compiled = compileTerms(TAXONOMY_2026_09)

const slugs = (list: { slug: string }[]) => list.map((item) => item.slug)

describe('fold', () => {
  it('lowers case and drops accents, keeping every position', () => {
    expect(fold('İstanbul Genève ÇAĞ')).toBe('istanbul geneve cag')
    const text = 'Neuroﬁbre Ünïversity'
    expect(fold(text)).toHaveLength(text.length)
  })
})

describe('findMatches', () => {
  it('matches capitalised acronyms only in their case', () => {
    expect(slugs(findMatches('We study LTP in slices', compiled))).toContain('synapses-plasticity')
    expect(slugs(findMatches('a ltp factor', compiled))).not.toContain('synapses-plasticity')
  })

  it('matches other words in any case, without accents, singular or plural', () => {
    expect(slugs(findMatches('ASTROCYTE signalling', compiled))).toContain('glia')
    expect(slugs(findMatches('two-photon imaging of microglia', compiled))).toEqual(
      expect.arrayContaining(['optical-imaging', 'glia']),
    )
    expect(slugs(findMatches('decision making in mice', compiled))).toEqual(
      expect.arrayContaining(['cognitive', 'mouse']),
    )
  })

  it('takes whole words only', () => {
    expect(slugs(findMatches('a mousetrap and a sleepwalker', compiled))).toEqual([])
  })

  it('prefers the longest match within a vocabulary', () => {
    const matches = findMatches('working memory', compiled).filter(
      (match) => match.vocabulary === 'subfield',
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]?.words).toBe('working memory')
  })
})

describe('suggestTags', () => {
  it('suggests tags from a postdoc posting', () => {
    const tags = suggestTags(
      {
        title: 'Postdoctoral researcher in systems neuroscience',
        text: 'We record neural circuits with Neuropixels and two-photon calcium imaging in mice during decision-making. Candidates hold a PhD in neuroscience.',
      },
      compiled,
    )
    expect(tags.positionType?.slug).toBe('postdoc')
    expect(slugs(tags.subfields)).toEqual(expect.arrayContaining(['systems-circuits', 'cognitive']))
    expect(slugs(tags.subfields)[0]).toBe('systems-circuits')
    expect(slugs(tags.methods)).toEqual(
      expect.arrayContaining(['electrophysiology', 'optical-imaging']),
    )
    expect(slugs(tags.modelSystems)).toEqual(['mouse'])
    expect(slugs(tags.careerStages)).toEqual(['early-postdoc', 'postdoc'])
  })

  it('does not take a PhD named as a requirement for the position type', () => {
    const tags = suggestTags(
      {
        title: 'Research fellow in glial biology',
        text: 'You will have a PhD in a relevant field.',
      },
      compiled,
    )
    expect(tags.positionType?.slug).toBe('postdoc')
    const none = suggestTags(
      { title: 'Scientist', text: 'A PhD in neuroscience is needed.' },
      compiled,
    )
    expect(none.positionType).toBeNull()
  })

  it('takes the position type from the text when the title has none', () => {
    const tags = suggestTags(
      { title: 'Vacancy 2026-118', text: 'We offer a fully funded PhD studentship on astrocytes.' },
      compiled,
    )
    expect(tags.positionType?.slug).toBe('phd')
    expect(slugs(tags.careerStages)).toEqual(['phd-candidate'])
  })

  it('suggests nothing for an unrelated posting', () => {
    const tags = suggestTags(
      { title: 'Finance officer', text: 'Manage budgets and invoices for the faculty.' },
      compiled,
    )
    expect(noSuggestions(tags)).toBe(true)
  })
})

describe('neuroscienceCheck', () => {
  const check = (title: string, text = '') => neuroscienceCheck({ title, text }, compiled).matches

  it('keeps a posting with a neuroscience word in its title', () => {
    expect(check('PhD position: glial cells in ageing')).toBe(true)
    expect(check('Postdoc in Neurowissenschaften (m/w/d)')).toBe(true)
    expect(check('Doctorant(e) en neurosciences')).toBe(true)
    expect(check('Research assistant, Brain Imaging Unit')).toBe(true)
    expect(check('Postdoc – basal ganglia and movement')).toBe(true)
  })

  it('keeps a posting whose text has at least two', () => {
    expect(
      check(
        'Postdoctoral researcher',
        'Our lab studies cortical circuits and the role of dopamine in learning.',
      ),
    ).toBe(true)
    expect(check('Research assistant', 'Help in our EEG lab.')).toBe(false)
  })

  it('does not keep a posting that only shares general words', () => {
    expect(
      check(
        'Research associate in cell biology',
        'Signal transduction and inflammation in liver cells; working memory of the team is valued.',
      ),
    ).toBe(false)
    expect(check('Finance officer', 'Budgets and invoices.')).toBe(false)
  })

  it('reads Japanese, Chinese and Korean', () => {
    expect(check('脳科学研究センター 研究員')).toBe(true)
    expect(check('神经科学研究所 博士后')).toBe(true)
  })
})
