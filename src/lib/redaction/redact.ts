// Redaction (PLAN §6.6, D52): the one function that removes contact details and personal names
// from a posting's text before anything is stored (a candidate's source text, the titles a monitor
// remembers) or exported for an AI draft. It works by rules, so it lowers the chance that a name is
// kept but cannot remove it (the risk accepted in §15.2, flag 6): email addresses and phone
// numbers are found reliably; names only where the text marks them, after a title (Prof., Dr.),
// before "Lab" or "Group", or after words such as "contact" or "supervised by".
//
// Each removed part becomes a placeholder in square brackets ([email], [phone], [name]), which the
// rules never match again, so redacting a redacted text changes nothing.

export const PLACEHOLDER = { email: '[email]', phone: '[phone]', name: '[name]' } as const

export type RedactionCounts = { email: number; phone: number; name: number }

export type Redaction = { text: string; counts: RedactionCounts }

// --- Email addresses ------------------------------------------------------------------------

// Also written out to fool harvesters: "jane.doe [at] example [dot] org", "jane(at)example.org".
const AT = String.raw`(?:@|\s*[[({]\s*at\s*[\])}]\s*)`
const DOT = String.raw`(?:\.|\s*[[({]\s*dot\s*[\])}]\s*)`
const EMAIL = new RegExp(
  String.raw`(?:mailto:)?[\p{L}\p{N}._%+-]+${AT}[\p{L}\p{N}-]+(?:${DOT}[\p{L}\p{N}-]+)*${DOT}\p{L}{2,}`,
  'giu',
)

// --- Phone numbers ----------------------------------------------------------------------------

/** A run of digits with the separators phone numbers use. */
const NUMBER = String.raw`\+?\(?\d[\d\s().\/–-]{5,}\d`

// After a word that says what follows, in the languages of the first sources.
const PHONE_AFTER_WORD = new RegExp(
  String.raw`(\b(?:tel(?:ephone|efon|éfono|efono|efoon)?|t[ée]l[ée]phone|tél|phone|tlf|fax|mobile?|mob|cell(?:phone)?|puh(?:elin)?|gsm)\b\.?\s*(?:no\.?|nr\.?|number)?\s*[:.]?\s*)(${NUMBER})`,
  'giu',
)

// An international number: + or 00 and a country code.
const PHONE_INTERNATIONAL = new RegExp(
  String.raw`(?<![\p{L}\p{N}+])(?:\+|00)[1-9][\d\s().\/–-]{6,}\d(?![\p{L}\p{N}])`,
  'gu',
)

// A national number written in groups, starting with 0: "020 7679 2000", "(030) 450 5000".
const PHONE_NATIONAL = new RegExp(
  String.raw`(?<![\p{L}\p{N}.,\/:-])\(?0\d{1,4}\)?[\s–-]\d{2,4}(?:[\s–-]\d{2,4}){1,3}(?![\p{L}\p{N}\/:-]|[.,]\d)`,
  'gu',
)

const digits = (value: string) => value.replace(/\D/g, '').length

// --- Names ----------------------------------------------------------------------------------

/**
 * A capitalised word with at least one lower-case letter (Smith, O'Brien, McDonald,
 * Müller-Lüdenscheidt); a possessive "'s" stays outside it.
 */
const CAPITALISED = String.raw`(?:\p{Lu}['’])?\p{Lu}\p{L}*\p{Ll}\p{L}*`
const WORD = String.raw`${CAPITALISED}(?:-${CAPITALISED})?`
/** An initial: "J." */
const INITIAL = String.raw`\p{Lu}\.`
/** Words that join the parts of a name: "van der Berg", "de la Cruz", "bin Ali". */
const PARTICLE = String.raw`(?:van|von|de|der|den|di|da|del|della|du|la|le|ter|ten|zu|af|al|el|bin|ibn|dos|das|do)`
const PART = String.raw`(?:${WORD}|${INITIAL})`
/** One to four parts. */
const NAME = String.raw`${PART}(?:[\s-]+(?:${PARTICLE}\s+)*${PART}){0,3}`

const TITLE = String.raw`(?:Prof(?:essor)?\.?|Dr\.?|PD|Priv\.-Doz\.|Univ\.-Prof\.|Mr\.?|Mrs\.?|Ms\.?|Mx\.?|Dott\.(?:ssa)?|Doç\.|Sir|Dame)`
/** Degrees and titles that can follow the first title: "Prof. Dr. med.", "Dr. rer. nat.". */
const MORE_TITLES = String.raw`(?:\s+(?:Dr\.?|Prof\.?|med\.|rer\.\s?nat\.|phil\.|habil\.|h\.\s?c\.|PhD|MD))*`

const AFTER_TITLE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(${TITLE}${MORE_TITLES}\s+)(${NAME})`,
  'gu',
)

const BEFORE_GROUP = new RegExp(
  String.raw`(?<![\p{L}\p{N}\]])(${NAME})((?:'s|’s)?\s+(?:Lab|Labs|Laboratory|lab|labs|laboratory|Research Group|research group|Group|group|Team|team)(?![\p{L}\p{N}]))`,
  'gu',
)

// Words that say a name follows, in any case; the name itself must be capitalised, so it is
// matched separately (NAME_AT) where the words end.
const LEAD_IN = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:(?:the\s+)?(?:laboratory|lab|group|team)\s+of|group\s+led\s+by|led\s+by|headed\s+by|supervised\s+by|(?:under\s+the\s+)?supervision\s+of|supervisors?:|PI:|principal\s+investigator:|contact(?:\s+persons?)?:|(?:please\s+)?contact|(?:informal\s+)?(?:enquiries|inquiries|questions)\s+[^.:\n]{0,40}?\bto|ansprechpartner(?:in)?:?|kontakt:|interlocuteur\s*:|responsable\s*:|referente\s*:|send\s+(?:your\s+)?applications?\s+to|addressed\s+to)\s+`,
  'giu',
)
const TITLE_AT = new RegExp(String.raw`${TITLE}${MORE_TITLES}\s+`, 'uy')
const NAME_AT = new RegExp(NAME, 'uy')
const NAME_EXACT = new RegExp(String.raw`^${NAME}$`, 'u')

/**
 * Capitalised words that are not names but often stand where one could: before "Lab" or "Group",
 * after "contact", or at the start of a sentence. Compared in lower case.
 */
const NOT_NAMES = new Set(
  `a about across adult advanced affective ageing aging all allen alzheimer alzheimer's an analysis anatomy and
  animal applicants application applications applied artificial assistant associate auditory autism
  basic behaviour behavior behavioral behavioural bio bioinformatics biochemistry biological biology biomedical
  biophysics brain brains cancer cardiovascular career careers cell cells cellular center centre chemical
  chemistry child chronic circuit circuits clinical cognition cognitive college comparative computational
  computer connectomics contact core cortical data department departments design development developmental
  digital director disease diseases division doctoral dynamics early ecology education electrophysiology
  emotion engineering environmental epilepsy european evolution evolutionary experimental faculty fellowship
  for functional general genetic genetics genome genomics glia glial global graduate group groups head health
  hr human humans imaging immunology in infection informatics information institute integrative intelligence
  international interdisciplinary junior lab laboratory labs language learning life machine management
  manager materials mathematics mechanisms medical medicine memory mental metabolism methods microscopy
  molecular motor mouse movement multi national network networks neural neurobiology neurodegeneration
  neurodevelopment neurogenetics neuroimaging neuroimmunology neurology neuron neurons neuropharmacology
  neurophysiology neuroscience neurosciences neurosurgery neurotechnology new office open optical our pain
  parkinson parkinson's pathology people perception pharmacology phd physics physiology platform population
  position positions postdoc postdoctoral program programme project projects psychiatry psychology public quantitative recruitment
  opening openings vacancy vacancies chair tenure track lecturer lecturers fellow fellows researcher researchers
  scientist scientists candidate candidates opportunity opportunities call calls studentship studentships
  regenerative research resources school science sciences scientific screening senior sensory signal
  single sleep social society software spatial stem structural student students synaptic synthetic system
  systems team technical technician technology the theoretical theory therapeutics this tissue training
  translational unit university vision visual we welcome work you your
  january february march april may june july august september october november december
  monday tuesday wednesday thursday friday saturday sunday`
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * Names that stand for an institution, a programme or a prize rather than a person, before "Lab"
 * or "Group" ("Max Planck Research Group", "Emmy Noether Group"). Compared in lower case.
 */
const EPONYMS = new Set([
  'max planck',
  'emmy noether',
  'marie curie',
  'marie skłodowska-curie',
  'humboldt',
  'howard hughes',
  'helmholtz',
  'leibniz',
  'fraunhofer',
  'kavli',
  'wellcome',
  'sainsbury wellcome',
  'gatsby',
  'simons',
  'hertie',
  'crick',
  'janelia',
  'wu tsai',
  'mcgovern',
  'picower',
  'zuckerman',
  'salk',
  'riken',
])

/** Whether `name` reads as a person's name rather than a topic, a unit or an eponym. */
function looksLikeName(name: string): boolean {
  if (!NAME_EXACT.test(name)) return false
  const lower = name.toLowerCase()
  if (EPONYMS.has(lower)) return false
  const words = lower.split(/[\s-]+/).filter((word) => !/^\p{L}\.$/u.test(word))
  return words.length > 0 && !words.some((word) => NOT_NAMES.has(word.replace(/['’]s$/, '')))
}

/**
 * The longest run of `found`'s words, from its start (after a title or a lead-in) or from its end
 * (before "Lab"), that reads as a name; null if none does. "Jane Doe Lab" after "Dr." gives
 * "Jane Doe", "Cognitive Neuroscience Smith" before "Lab" gives "Smith".
 */
function nameIn(found: string, from: 'start' | 'end'): string | null {
  const words = found.split(/\s+/)
  for (let size = words.length; size > 0; size--) {
    const part = (from === 'start' ? words.slice(0, size) : words.slice(-size)).join(' ')
    if (looksLikeName(part)) return part
  }
  return null
}

// --- The function -----------------------------------------------------------------------------

/**
 * `input` with email addresses, phone numbers and the names the rules can find replaced by
 * placeholders, and how many of each were replaced.
 */
export function redact(input: string): Redaction {
  const counts: RedactionCounts = { email: 0, phone: 0, name: 0 }
  let text = input.normalize('NFC')

  text = text.replace(EMAIL, () => {
    counts.email++
    return PLACEHOLDER.email
  })

  text = text.replace(PHONE_AFTER_WORD, (match, word: string, number: string) => {
    if (digits(number) < 6) return match
    counts.phone++
    return `${word}${PLACEHOLDER.phone}`
  })
  for (const pattern of [PHONE_INTERNATIONAL, PHONE_NATIONAL]) {
    text = text.replace(pattern, (match) => {
      const count = digits(match)
      if (count < 9 || count > 15) return match
      counts.phone++
      return PLACEHOLDER.phone
    })
  }

  text = text.replace(AFTER_TITLE, (match, title: string, found: string) => {
    const person = nameIn(found, 'start')
    if (!person) return match
    counts.name++
    return `${title}${PLACEHOLDER.name}${found.slice(person.length)}`
  })
  text = text.replace(BEFORE_GROUP, (match, found: string, group: string) => {
    const person = nameIn(found, 'end')
    if (!person) return match
    counts.name++
    return `${found.slice(0, found.length - person.length)}${PLACEHOLDER.name}${group}`
  })
  text = replaceAfterLeadIns(text, counts)

  return { text, counts }
}

/** Names after the words of LEAD_IN ("please contact Jane Doe", "supervised by Prof. Ng"). */
function replaceAfterLeadIns(text: string, counts: RedactionCounts): string {
  let result = ''
  let done = 0
  for (const lead of text.matchAll(LEAD_IN)) {
    let at = lead.index + lead[0].length
    if (at < done) continue
    TITLE_AT.lastIndex = at
    const title = TITLE_AT.exec(text)
    if (title) at += title[0].length
    NAME_AT.lastIndex = at
    const found = NAME_AT.exec(text)
    const person = found ? nameIn(found[0], 'start') : null
    if (!person) continue
    result += text.slice(done, at) + PLACEHOLDER.name
    done = at + person.length
    counts.name++
  }
  return result + text.slice(done)
}

/** `input` redacted, or null for an empty value. */
export function redacted(input: string | null | undefined): string | null {
  if (input == null || input.trim() === '') return null
  return redact(input).text
}
