import { type CompiledTerms, findMatches, fold } from './match'

// Whether a posting a monitor found is about neuroscience (D52: "keep the postings that match
// neuroscience by the taxonomy's synonyms"). Many subfield synonyms are not specific to the
// nervous system ("memory", "inflammation", "cell biology"), so they alone do not keep a posting
// from a whole university's list; a posting is kept when its title has a neuroscience word, or its
// text has at least two. A neuroscience word is one of the words below, in the languages of the
// first sources, or a subfield synonym that contains one or names a part or cell of the nervous
// system. Sources whose every posting is in neuroscience skip this check (`allNeuroscience`).

/** Words that only neuroscience uses, folded (lower case, no accents), as the start of a word. */
const STEMS = [
  'neuro',
  'neural',
  'neuron',
  'brain',
  'glia',
  'glial',
  'synap',
  'cortex',
  'cortical',
  'hippocamp',
  'amygdal',
  'thalam',
  'hypothalam',
  'cerebell',
  'cerebr',
  'striat',
  'dopamin',
  'axon',
  'dendrit',
  'astrocyt',
  'microgli',
  'oligodendro',
  'myelin',
  'spinal cord',
  'nervous system',
  'cognitive neuro',
  'cognition',
  'psychiatr',
  'dementia',
  'alzheimer',
  'parkinson',
  'huntington',
  'epilep',
  'autism',
  'autistic',
  'schizophren',
  'multiple sclerosis',
  'amyotrophic',
  'electrophysiolog',
  'optogenet',
  'chemogenet',
  'connectom',
  'electroencephalogra',
  'magnetoencephalogra',
  'functional magnetic resonance',
  'neuroimaging',
  // German, French, Spanish, Italian, Portuguese, Dutch, Scandinavian, Finnish, Turkish
  'gehirn',
  'hirnforschung',
  'cerveau',
  'cervell',
  'hersen',
  'hjarn',
  'hjerne',
  'aivotutki',
  'beyin',
  'sinir bilim',
  'norobilim',
] as const

/** Acronyms, matched as whole words in their case. */
const ACRONYMS = ['EEG', 'MEG', 'fMRI', 'ALS', 'BCI', 'iEEG', 'ECoG'] as const

/** Words in scripts without spaces between words: matched anywhere. */
const ANYWHERE = ['脳', '神経', '脑', '神经', '뇌', '신경'] as const

const STEM = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${STEMS.map((stem) => stem.replace(/ /g, String.raw`[\s-]+`)).join('|')})`,
  'gu',
)
const ACRONYM = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${ACRONYMS.join('|')})(?![\p{L}\p{N}])`,
  'gu',
)
const CJK = new RegExp(ANYWHERE.join('|'), 'gu')

/** Subfield synonyms without one of the stems that still only neuroscience uses (folded, singular). */
const SPECIFIC_SYNONYMS = new Set([
  'ltp',
  'long-term potentiation',
  'stdp',
  'dendritic spine',
  'opc',
  'schwann cell',
  'gliotransmission',
  'basal ganglia',
  'motor cortex',
  'central pattern generator',
  'motor neuron',
  'neuroethology',
  'olfaction',
  'nociception',
  'somatosensation',
  'neurolinguistic',
  'blood-brain barrier',
  'bbb',
  'gut-brain axis',
  'bci',
])

/** How many neuroscience words `text` holds. */
function count(text: string, compiled: CompiledTerms): number {
  const folded = fold(text)
  const spans: Array<[number, number]> = []
  const add = (start: number, end: number) => {
    if (!spans.some(([a, b]) => start < b && a < end)) spans.push([start, end])
  }
  for (const match of folded.matchAll(STEM)) add(match.index, match.index + match[0].length)
  for (const match of text.matchAll(ACRONYM)) add(match.index, match.index + match[0].length)
  for (const match of text.matchAll(CJK)) add(match.index, match.index + match[0].length)
  // A subfield's synonym counts when it holds a neuroscience word (the stems above find it) or
  // is one of the subfield synonyms that name the nervous system's parts and cells.
  for (const match of findMatches(text, compiled)) {
    if (
      match.vocabulary === 'subfield' &&
      SPECIFIC_SYNONYMS.has(fold(match.words).replace(/s$/, ''))
    ) {
      add(match.start, match.end)
    }
  }
  return spans.length
}

export type NeuroscienceCheck = { matches: boolean; title: number; text: number }

/** Whether a posting with this title and text is kept as a neuroscience posting. */
export function neuroscienceCheck(
  { title, text }: { title: string; text: string },
  compiled: CompiledTerms,
): NeuroscienceCheck {
  const inTitle = count(title, compiled)
  const inText = count(text, compiled)
  return { matches: inTitle >= 1 || inText >= 2, title: inTitle, text: inText }
}
