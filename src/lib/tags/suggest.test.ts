import { describe, expect, it } from 'vitest'

import { TAXONOMY_2026_09 } from '@/migrations/data/taxonomy-2026-09'

import { compileTerms, findMatches, fold } from './match'
import { neuroscienceCheck, unitSpans } from './neuroscience'
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
    expect(check('Sinirbilim Anabilim Dalı araştırma görevlisi')).toBe(true)
    expect(check('Nörolojik Bilimler Enstitüsü proje bursiyeri')).toBe(true)
    expect(check('Norovirus vaccine research assistant')).toBe(false)
    expect(check('Profesor asistente de Psiquiatría')).toBe(true)
    expect(check('Forskningsassistent i psykiatri')).toBe(true)
    expect(check('Stipendiat i nevrovitenskap')).toBe(true)
    expect(check('Pesquisador', 'Estudamos a cognição e a demência em modelos animais.')).toBe(true)
    expect(check('Investigador postdoctoral', 'Plasticidad sináptica en la médula espinal.')).toBe(
      true,
    )
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

  it("does not count a neuroscience word used for another field's subject (M7, second round)", () => {
    expect(check('UCSF Fresno - Cardiology Electrophysiology Faculty Opportunity')).toBe(false)
    expect(
      check(
        'Cardiac electrophysiologist',
        'Electrophysiology of the heart and atrial fibrillation.',
      ),
    ).toBe(false)
    expect(
      check('Research nurse', 'Neuroendocrine tumours of the pancreas; neuroendocrine neoplasms.'),
    ).toBe(false)
    expect(check('Postdoc in cortical electrophysiology')).toBe(true)
    expect(check('Neuroendocrinology of stress')).toBe(true)
    expect(check('Fellow', 'Heart rhythm electrophysiology and neural circuits.')).toBe(false)
    // A run of hyphens after "heart" costs linear time.
    const started = performance.now()
    check('Fellow', `Heart ${'-'.repeat(30_000)}`)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('reads Japanese, Chinese and Korean', () => {
    expect(check('脳科学研究センター 研究員')).toBe(true)
    expect(check('神经科学研究所 博士后')).toBe(true)
  })

  it("does not count the words of the employing unit's name in the text", () => {
    // M7's first run: a department's name kept posts in other fields.
    const ad = [
      'The Department of Clinical Neuroscience at the university is one of the largest departments.',
      'Our research group in pharmacoepidemiology at the Department of Clinical Neuroscience studies drug use in pregnancy.',
      'Dept. of Clinical Neurosciences, Queen Square Institute of Neurology, Queensland Brain Institute.',
    ].join('\n')
    expect(check('Research assistant in pharmacoepidemiology', ad)).toBe(false)
    // Without the rule the same text would count.
    expect(neuroscienceCheck({ title: 'x', text: ad }, compiled).text).toBe(0)
    // A neuroscience post at such a department still has its own words.
    expect(
      check(
        'Postdoctoral researcher',
        `${ad}\nWe record from hippocampal neurons to study synaptic plasticity.`,
      ),
    ).toBe(true)
    // The title keeps every word.
    expect(check('Postdoc at the Department of Neuroscience', 'Budgets.')).toBe(true)
  })

  it('finds unit names in the languages of the sources, and stops at a line break', () => {
    const named = (text: string) => unitSpans(text).map(([a, b]) => text.slice(a, b))
    // A capitalised word before the head joins the name: harmless, it is not about the post.
    expect(named('Die Klinik für Neurologie sucht eine Doktorandin.')).toEqual([
      'Die Klinik für Neurologie',
    ])
    expect(named('am Institut für klinische Neurobiologie und Hirnforschung.')).toEqual([
      'Institut für klinische Neurobiologie und Hirnforschung',
    ])
    expect(named('Institutionen för klinisk neurovetenskap söker en forskningsassistent')).toEqual([
      'Institutionen för klinisk neurovetenskap söker',
    ])
    expect(named("au sein de l'Institut du Cerveau à Paris")).toEqual(['Institut du Cerveau'])
    expect(named('Hacettepe Üniversitesi Nörolojik Bilimler ve Psikiyatri Enstitüsü')).toEqual([
      'Hacettepe Üniversitesi Nörolojik Bilimler ve Psikiyatri Enstitüsü',
    ])
    expect(named('Neuroscience\nDepartment of Biology')).toEqual(['Department of Biology'])
    expect(named('a departmental budget')).toEqual([])
    // Labs and groups say what they study: not units here.
    expect(named('the Neural Circuits Lab and the Brain Imaging Group')).toEqual([])
  })

  it('takes linear time on long runs of capitalised words and of unit names', () => {
    const words = 'Aa '.repeat(40_000)
    const units = 'Department of Neuroscience\n'.repeat(20_000)
    for (const text of [words, units]) {
      const started = performance.now()
      unitSpans(text)
      neuroscienceCheck({ title: 'x', text }, compiled)
      expect(performance.now() - started).toBeLessThan(1500)
    }
  })

  it("leaves out the names a source lists, and the employer's own, in any case", () => {
    const text =
      'Join the clinical neuroscience department; we study drug use in neurology clinics.'
    expect(neuroscienceCheck({ title: 'x', text }, compiled).text).toBe(2)
    expect(neuroscienceCheck({ title: 'x', text }, compiled, ['Clinical Neuroscience']).text).toBe(
      1,
    )
    expect(check('Research assistant', text)).toBe(true)
    expect(
      neuroscienceCheck({ title: 'Research assistant', text }, compiled, ['clinical neuroscience'])
        .matches,
    ).toBe(false)
  })
})
