import { type CompiledTerms, findMatches, fold } from './match'

// Whether a posting a monitor found is about neuroscience (D52: "keep the postings that match
// neuroscience by the taxonomy's synonyms"). Many subfield synonyms are not specific to the
// nervous system ("memory", "inflammation", "cell biology"), so they alone do not keep a posting
// from a whole university's list; a posting is kept when its title has a neuroscience word, or its
// text has at least two. A neuroscience word is one of the words below, in the languages of the
// first sources, or a subfield synonym that contains one or names a part or cell of the nervous
// system. Sources whose every posting is in neuroscience skip this check (`allNeuroscience`).
//
// The names of the units that employ people ("Department of Clinical Neuroscience", "Queensland
// Brain Institute", "Klinik für Neurologie") say where a post is, not what it is about: an
// employer's ads repeat them in every posting, whatever its field (M7's first run found
// pharmacoepidemiology posts kept for their department's name). So their words do not count in a
// posting's text, nor do the employer's own names and the names a source lists as not counting
// (`ignoredNames`). The title is the post's own name and keeps every word. Labs and groups are left
// alone: their names say what they study.

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
  'psykiatr',
  'nevro',
  'aivotutki',
  'beyin',
  // Spanish and Portuguese (neurociencia and cerebro are found by neuro and cerebr above)
  'psiquiatr',
  'demenc',
  'esquizofren',
  'cognic',
  'sinap',
  'sistema nervios',
  'sistema nervos',
  'medula espinal',
  'electrofisiolog',
  'eletrofisiolog',
  'sinir bilim',
  'sinirbilim',
  'norobilim',
  'noroloj',
  'noropsik',
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

type Span = readonly [number, number]

// Units that employ people, in the languages of the sources: before their name ("Department of …")
// or after it ("… Institute", Turkish "… Enstitüsü").
const HEADS = [
  'Department',
  'Dept\\.?',
  'Institute',
  'Centre',
  'Center',
  'Division',
  'School',
  'Faculty',
  'Clinic',
  'Hospital',
  'Section',
  'Institut',
  'Zentrum',
  'Klinik',
  'Klinikum',
  'Abteilung',
  'Fachbereich',
  'Fakultät',
  'Lehrstuhl',
  'Département',
  'Unité',
  'École',
  'Departamento',
  'Instituto',
  'Centro',
  'Facultad',
  'Faculdade',
  'Escuela',
  'Dipartimento',
  'Istituto',
  'Scuola',
  'Afdeling',
  'Instituut',
  'Centrum',
  'Faculteit',
]
const SUFFIXES = ['Enstitüsü', 'Merkezi', 'Bölümü', 'Anabilim Dalı', 'Fakültesi', 'Kliniği']
// Scandinavian unit names go on in lower case ("Institutionen för klinisk neurovetenskap").
const LOWER_HEADS = ['Institutionen', 'Institutt', 'Avdelningen', 'Avdelingen']

// Within a name, words are separated by spaces, never by a line break (a heading stays its own).
const SP = String.raw`[^\S\n]+`
const CAP = String.raw`(?:\p{Lu}[\p{L}\p{M}'’-]*)`
const JOIN = String.raw`(?:and|&|of|for|the|und|et|y|e|en|och|og|ve|de|du|des|di|del|della|la|le|der|die|das|für|voor|van|för)`
// At most seven capitalised words, two small words between two of them: bounded, so that a long
// run of capitalised words costs linear time, never quadratic (a monitor reads untrusted pages).
const CAPS = String.raw`${CAP}(?:${SP}(?:${JOIN}${SP}){0,2}${CAP}){0,6}`
// After "of": a name of capitalised words; in German up to two lower-case adjectives before a noun
// ("für klinische Neurobiologie").
const NAME = String.raw`(?:\p{Ll}[\p{L}\p{M}-]*${SP}){0,2}${CAPS}`
const AFTER = String.raw`(?:of|for|für|fur|de(?:${SP}la)?|du|des|d['’]|di|del|della|dei|delle|degli|voor|van|för|da|do|dos|das)`
const START = String.raw`(?<![\p{L}\p{N}])`
const END = String.raw`(?![\p{L}\p{N}])`
const UNIT = new RegExp(
  [
    // (Name) Head (of Name): "Queen Square Institute of Neurology", "Department of Neuroscience"
    String.raw`${START}(?:${CAPS}${SP})?(?:${HEADS.join('|')})${END}(?:${SP}${AFTER}${SP}(?:the${SP})?${NAME})?`,
    // Name Suffix: "Beyin Araştırmaları Merkezi"
    String.raw`${START}${CAPS}${SP}(?:${SUFFIXES.join('|')})${END}`,
    // Head för three lower-case words at most
    String.raw`${START}(?:${LOWER_HEADS.join('|')})${SP}(?:för|for|i)${SP}[\p{L}-]+(?:${SP}[\p{L}-]+){0,2}`,
  ].join('|'),
  'gu',
)

/** Where `text` names a unit that employs people, or one of `names` (any case, accents folded). */
export function unitSpans(text: string, names: readonly string[] = []): Span[] {
  const spans: Span[] = []
  for (const match of text.matchAll(UNIT)) {
    spans.push([match.index, match.index + match[0].length])
  }
  const folded = fold(text)
  for (const name of names) {
    const wanted = fold(name.trim()).replace(/\s+/g, ' ')
    if (wanted.length < 3) continue
    const pattern = new RegExp(
      String.raw`(?<![\p{L}\p{N}])${wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, String.raw`\s+`)}(?![\p{L}\p{N}])`,
      'gu',
    )
    for (const match of folded.matchAll(pattern)) {
      spans.push([match.index, match.index + match[0].length])
    }
  }
  return spans
}

/** The most characters of a posting's text the check reads: a posting says what it is early. */
export const TEXT_CHECKED = 30_000

/** Whether [start, end) overlaps one of `spans`, sorted by start and not overlapping each other. */
function overlaps(spans: readonly Span[], start: number, end: number): boolean {
  let low = 0
  let high = spans.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (spans[mid]![1] <= start) low = mid + 1
    else high = mid
  }
  return low < spans.length && spans[low]![0] < end
}

/** `spans` sorted, overlapping ones merged. */
function merged(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const result: Array<[number, number]> = []
  for (const [start, end] of sorted) {
    const last = result[result.length - 1]
    if (last && start < last[1]) last[1] = Math.max(last[1], end)
    else result.push([start, end])
  }
  return result
}

/** How many neuroscience words `text` holds, outside the spans in `ignored`. */
function count(text: string, compiled: CompiledTerms, ignored: readonly Span[] = []): number {
  const folded = fold(text)
  const skipped = merged(ignored)
  const found: Array<[number, number]> = []
  const add = (start: number, end: number) => {
    if (!overlaps(skipped, start, end)) found.push([start, end])
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
  return merged(found).length
}

export type NeuroscienceCheck = { matches: boolean; title: number; text: number }

/**
 * Whether a posting with this title and text is kept as a neuroscience posting. In the text, the
 * names of units that employ people and `ignoredNames` (the employer's names, the source's list)
 * do not count.
 */
export function neuroscienceCheck(
  { title, text }: { title: string; text: string },
  compiled: CompiledTerms,
  ignoredNames: readonly string[] = [],
): NeuroscienceCheck {
  const inTitle = count(title.slice(0, 1000), compiled)
  const checked = text.slice(0, TEXT_CHECKED)
  const inText = count(checked, compiled, unitSpans(checked, ignoredNames))
  return { matches: inTitle >= 1 || inText >= 2, title: inTitle, text: inText }
}
