import { describe, expect, it } from 'vitest'

import { TAXONOMY_2026_09 as TERMS } from './taxonomy-2026-09'

// The seed is frozen, so this test checks it against the plan as of 2026-09, not against the
// current vocabulary lists in src/lib/taxonomy.ts.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// PLAN §4.2–4.7, in the plan's order.
const EXPECTED: Record<string, string[]> = {
  subfield: [
    'molecular-cellular',
    'synapses-plasticity',
    'glia',
    'neurogenetics',
    'developmental',
    'systems-circuits',
    'sensory',
    'motor',
    'cognitive',
    'affective-social',
    'behavioral',
    'computational-theoretical',
    'integrative-physiology',
    'neuroimmunology',
    'neuropharmacology',
    'clinical-translational',
    'neurotechnology-bci',
    'evolutionary-comparative',
    'neuroethics-society',
  ],
  method: [
    'electrophysiology',
    'optical-imaging',
    'em-connectomics',
    'mri-fmri',
    'eeg-meg',
    'pet-spect',
    'intracranial-human',
    'opto-chemogenetics',
    'brain-stimulation',
    'genetic-tools',
    'omics',
    'single-cell-spatial',
    'biochemistry-structural',
    'anatomy-histology',
    'behavioral-assays',
    'psychophysics-tasks',
    'clinical-trials',
    'epidemiology-cohorts',
    'computational-modeling',
    'machine-learning',
    'statistics-data-science',
    'neuroinformatics',
    'device-engineering',
  ],
  'model-system': [
    'human',
    'human-tissue',
    'non-human-primate',
    'rodent',
    'mouse',
    'rat',
    'other-mammals',
    'birds',
    'zebrafish',
    'amphibians',
    'drosophila',
    'c-elegans',
    'other-invertebrates',
    'cell-culture',
    'ipsc-organoids',
    'in-silico',
    'not-applicable',
  ],
  'position-type': ['msc', 'phd', 'postdoc', 'research-staff', 'faculty-pi', 'industry'],
  'career-stage': [
    'student',
    'phd-candidate',
    'early-postdoc',
    'postdoc',
    'independent',
    'research-staff',
    'industry-professional',
  ],
  'event-type': [
    'conference',
    'symposium-workshop',
    'school',
    'course',
    'online-seminar',
    'hackathon',
    'career-event',
  ],
  'event-format': ['in-person', 'online', 'hybrid'],
  'deadline-type': [
    'abstract',
    'travel-grant',
    'registration-early',
    'registration',
    'application',
    'fee-waiver',
  ],
  'funding-type': [
    'individual-fellowship',
    'research-grant',
    'travel-mobility',
    'small-grant',
    'prize',
  ],
  'resource-type': [
    'dataset-repository',
    'software-tool',
    'atlas-reference',
    'data-standard',
    'guide-tutorial',
    'course',
    'community',
  ],
  'evidence-level': ['cell-molecular', 'animal', 'human-observational', 'clinical-trial', 'mixed'],
  'disease-area': [
    'neurodegenerative',
    'neurodevelopmental',
    'psychiatric',
    'epilepsy',
    'stroke-vascular',
    'pain-headache',
    'sleep-disorders',
    'neuroinflammatory-demyelinating',
    'neuro-oncology',
    'sensory-disorders',
    'injury-trauma',
    'rare-neurogenetic',
  ],
}

// PLAN §4.3: method groups.
const METHOD_GROUP_OF: Record<string, string> = {
  electrophysiology: 'recording-imaging',
  'optical-imaging': 'recording-imaging',
  'em-connectomics': 'recording-imaging',
  'mri-fmri': 'recording-imaging',
  'eeg-meg': 'recording-imaging',
  'pet-spect': 'recording-imaging',
  'intracranial-human': 'recording-imaging',
  'opto-chemogenetics': 'manipulation',
  'brain-stimulation': 'manipulation',
  'genetic-tools': 'manipulation',
  omics: 'molecular',
  'single-cell-spatial': 'molecular',
  'biochemistry-structural': 'molecular',
  'anatomy-histology': 'molecular',
  'behavioral-assays': 'behaviour-clinical',
  'psychophysics-tasks': 'behaviour-clinical',
  'clinical-trials': 'behaviour-clinical',
  'epidemiology-cohorts': 'behaviour-clinical',
  'computational-modeling': 'computational',
  'machine-learning': 'computational',
  'statistics-data-science': 'computational',
  neuroinformatics: 'computational',
  'device-engineering': 'engineering',
}

// Labels the plan gives verbatim (PLAN §4.2–4.4).
const PLAN_LABELS: Record<string, string> = {
  'subfield/molecular-cellular': 'Molecular and cellular',
  'subfield/glia': 'Glial biology',
  'subfield/behavioral': 'Behavioural and neuroethology',
  'subfield/neuroethics-society': 'Neuroethics, education and society',
  'method/electrophysiology': 'Electrophysiology',
  'method/opto-chemogenetics': 'Opto- and chemogenetics',
  'model-system/human': 'Human participants',
  'model-system/cell-culture': 'Primary cells and cell lines',
  'model-system/ipsc-organoids': 'iPSC-derived cells and organoids',
}

describe('initial taxonomy (PLAN §4)', () => {
  it('has exactly the plan’s terms, vocabulary by vocabulary, in the plan’s order', () => {
    for (const [vocabulary, expected] of Object.entries(EXPECTED)) {
      const slugs = TERMS.filter((term) => term.vocabulary === vocabulary).map((term) => term.slug)
      expect(slugs, vocabulary).toEqual(expected)
    }
    expect(TERMS).toHaveLength(Object.values(EXPECTED).flat().length)
  })

  it('uses valid slugs', () => {
    for (const term of TERMS) expect(term.slug, term.slug).toMatch(SLUG)
  })

  it('uses the plan’s labels where the plan gives them', () => {
    for (const [key, label] of Object.entries(PLAN_LABELS)) {
      const term = TERMS.find((t) => `${t.vocabulary}/${t.slug}` === key)
      expect(term?.label, key).toBe(label)
    }
  })

  it('puts every method in its plan group, and gives no group to other terms', () => {
    for (const term of TERMS) {
      if (term.vocabulary === 'method') {
        expect(term.group, term.slug).toBe(METHOD_GROUP_OF[term.slug])
      } else {
        expect(term.group, term.slug).toBeUndefined()
      }
    }
  })

  it('makes mouse and rat children of rodent, listed after it, and has no other parents', () => {
    const withParent = TERMS.filter((term) => term.parent)
    expect(withParent.map((term) => [term.slug, term.parent])).toEqual([
      ['mouse', 'rodent'],
      ['rat', 'rodent'],
    ])
    const index = (slug: string) => TERMS.findIndex((term) => term.slug === slug)
    expect(index('rodent')).toBeLessThan(index('mouse'))
  })

  it('gives every term a label, a one-sentence description and synonyms', () => {
    for (const term of TERMS) {
      expect(term.label.trim(), term.slug).not.toBe('')
      expect(term.description, term.slug).toMatch(/^\S.*\.$/)
      expect(term.synonyms.length, term.slug).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps synonyms trimmed, unique within a vocabulary and different from the labels', () => {
    for (const vocabulary of Object.keys(EXPECTED)) {
      const terms = TERMS.filter((term) => term.vocabulary === vocabulary)
      const labels = new Set(terms.map((term) => term.label.toLowerCase()))
      const seen = new Map<string, string>()
      for (const term of terms) {
        for (const synonym of term.synonyms) {
          const key = synonym.toLowerCase()
          expect(synonym, term.slug).toBe(synonym.trim())
          expect(labels.has(key), `${term.slug}: ${synonym}`).toBe(false)
          expect(seen.get(key), `${term.slug}: ${synonym}`).toBeUndefined()
          seen.set(key, term.slug)
        }
      }
    }
  })

  it('leaves out words that would tag unrelated adverts', () => {
    const all = new Set(TERMS.flatMap((term) => term.synonyms.map((s) => s.toLowerCase())))
    for (const word of ['ltd', 'mrs', 'bids', 'ms', 'ad', 'pd', 'pi', 'em', 'none', 'n/a']) {
      expect(all.has(word), word).toBe(false)
    }
    for (const word of ['award', 'startup', 'virtual', 'remote', 'hearing', 'touch', "master's"]) {
      expect(all.has(word), word).toBe(false)
    }
  })
})
