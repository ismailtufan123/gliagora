// Redaction (PLAN §6.6, D52): the one function that removes contact details and personal names
// from a posting's text and title before anything is stored (a candidate's source text and title,
// the titles a monitor remembers) or exported for an AI draft. It works by rules, so it lowers the
// chance that a name is kept but cannot remove it (the risk accepted in §15.2, flag 6): email
// addresses, phone numbers and web addresses are found reliably; names only where the text marks
// them: after a title (Prof., Dr.) or a role ("Team Leader:", "recruitment adviser"), before
// "Lab" or "Group" or a role ("Jane Doe, HR partner"), after words such as "contact" or "supervised
// by", on the lines of a contact block, joined to a name already found ("Doe and Roe Labs"), as
// initials in brackets ("(A.C.)") or inside a CNRS offer reference ("UMR1234-JANDOE-001").
//
// The first weekly AI drafts (2026-10-22) showed what the first rules missed (M7 notes, third
// round): HR and union contact blocks with their phone numbers, recruitment advisers, "Team Leader:
// …" lines, names inside lab names and web addresses, CNRS references, file names, US phone
// numbers and obfuscated email addresses; and what they removed that was not a name ("Cold Spring
// Harbor", "Talent Acquisition Team"). Every rule has invented examples in redact.test.ts, those
// that must go and those that must stay.
//
// Each removed part becomes a placeholder in square brackets ([email], [phone], [name], [link]),
// which the rules never match again, so redacting a redacted text changes nothing.

export const PLACEHOLDER = {
  email: '[email]',
  phone: '[phone]',
  name: '[name]',
  link: '[link]',
} as const

export type RedactionCounts = { email: number; phone: number; name: number; link: number }

export type Redaction = { text: string; counts: RedactionCounts }

const emptyCounts = (): RedactionCounts => ({ email: 0, phone: 0, name: 0, link: 0 })

// --- Email addresses ------------------------------------------------------------------------

// Also written out to fool harvesters: "jane.doe [at] example [dot] org", "jane(at)example.org",
// "jane.doe(a)example.fi" (Finnish sites), "jane.doe @ example.org", "jane.doe＠example.org".
const AT = String.raw`(?:\s?[@＠]\s?|\s*[[({<]\s*(?:at|a|ät|@)\s*[\])}>]\s*)`
const DOT = String.raw`(?:\.|\s*[[({<]\s*(?:dot|punkt|point|punto)\s*[\])}>]\s*)`
// Each match starts where a run of an address's characters starts: a long run without "@" is then
// read once, not once from every one of its characters.
const EMAIL = new RegExp(
  String.raw`(?<![\p{L}\p{N}._%+'-])(?:mailto:)?[\p{L}\p{N}._%+'-]+${AT}[\p{L}\p{N}-]+(?:${DOT}[\p{L}\p{N}-]+)*${DOT}\p{L}{2,}`,
  'giu',
)
// "jane.doe at example dot org" or "jane.doe at example.org": plain words, only for a local part
// with a dot or an underscore (a person's address), so that "Apply at example.org" stays.
const EMAIL_WORDS = new RegExp(
  String.raw`(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}%+-]+[._][\p{L}\p{N}._%+-]*\s+at\s+[\p{L}\p{N}-]+(?:(?:\.|\s+dot\s+)[\p{L}\p{N}-]+)*(?:\.|\s+dot\s+)\p{L}{2,}(?![\p{L}\p{N}])`,
  'giu',
)

const EMAIL_DOT_WORDS = new RegExp(
  String.raw`(?<![\p{L}\p{N}])[\p{L}\p{N}]+(?:\s+dot\s+[\p{L}\p{N}]+)+\s+at\s+[\p{L}\p{N}-]+(?:\s+dot\s+[\p{L}\p{N}-]+)+(?![\p{L}\p{N}])`,
  'giu',
)

// --- Web addresses and file names --------------------------------------------------------------

// A lab's site or a person's page often carries a name ("doelab.example.edu", "/people/jane-doe"),
// and so does a document ("Call_Rossi_2026.pdf"). None is needed for a draft, so every one goes.
const URL_WITH_SCHEME = /\b(?:https?|ftp):\/\/[^\s<>"'()[\]{}]+/giu
const URL_WWW = /(?<![\p{L}\p{N}.@/-])www\.[^\s<>"'()[\]{}]+/giu
/** Bare host names in lower case ("doelab.org", "lab.example.ac.uk/people"). */
const HOST = new RegExp(
  String.raw`(?<![\p{L}\p{N}@./_-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|edu|gov|io|info|eu|ai|science|[a-z]{2})(?:\/[^\s<>"'()[\]{}]*)?(?![\p{L}\p{N}@-])`,
  'gu',
)
const FILE =
  /(?<![\p{L}\p{N}_.()+-])[\p{L}\p{N}_.()+-]*[\p{L}\p{N}]\.(?:pdf|docx?|odt|rtf|xlsx?|pptx?|zip)(?![\p{L}\p{N}])/giu

/** A matched address without the full stop or comma that ends its sentence. */
function trimmed(match: string): { address: string; rest: string } {
  const end = /[.,;:!?]+$/.exec(match)
  return end ? { address: match.slice(0, end.index), rest: end[0] } : { address: match, rest: '' }
}

// --- Phone numbers ----------------------------------------------------------------------------

/** A run of digits with the separators phone numbers use. */
const NUMBER = String.raw`\+?\(?\d[\d\s().\/–-]{5,}\d`

// After a word that says what follows, in the languages of the sources.
const PHONE_AFTER_WORD = new RegExp(
  String.raw`(\b(?:tel(?:ephone|efon|éfono|efono|efoon|efonnummer)?|t[ée]l[ée]phone|tél|telf|tfn|phone|tlf|fax|mobile?|mob|cell(?:phone|ular)?|celular|m[óo]vil|handy|puh(?:elin)?|gsm|whatsapp|direct\s+(?:line|dial)|switchboard|ph)\b\.?\s*(?:no\.?|nr\.?|number|n[º°])?\s*[:.]?\s*)(${NUMBER})`,
  'giu',
)

// An international number: + or 00 and a country code.
const PHONE_INTERNATIONAL = new RegExp(
  String.raw`(?:(?<![\p{N}+])\+|(?<![\p{L}\p{N}+])00)[1-9][\d\s().\/–-]{6,}\d(?![\p{L}\p{N}])`,
  'gu',
)

// A national number written in groups, starting with 0: "020 7946 0000", "(030) 450 5000",
// "08-524 864 00", "0761/203-1234", "040 3787111", "020 - 566 9111".
const SEPARATOR = String.raw`(?:\s*[–-]\s*|[^\S\n]|\/)`
const PHONE_NATIONAL = new RegExp(
  String.raw`(?<![\p{L}\p{N}.,\/:'’-])(?<!\d[^\S\n])\(?0[1-9]\d{0,3}\)?${SEPARATOR}\d{2,8}(?:(?:\s*[–-]\s*|[^\S\n])\d{2,8}){0,4}(?![\p{L}\p{N}\/:-]|[.,]\d)`,
  'gu',
)
// French numbers in pairs with dots: "01.23.45.67.89".
const PHONE_PAIRS = /(?<![\p{L}\p{N}.,/:-])0[1-9](?:\.\d{2}){4}(?![\p{L}\p{N}]|[.,]\d)/gu
// North American numbers: "(415) 555-0100", "415-555-0100", "415.555.0100", "1-415-555-0100".
const PHONE_NANP = new RegExp(
  String.raw`(?<![\p{L}\p{N}$€£#.,\/-])(?:1[\s.-]?)?(?:\(\s?[2-9]\d{2}\s?\)\s?|[2-9]\d{2}[\s.-])[2-9]\d{2}[\s.-]\d{4}(?![\p{N}]|[.,-]\d)`,
  'gu',
)

// Mobiles without a leading 0: Spanish "612 345 678", Italian "333 123 4567"; and Danish or
// Norwegian numbers in pairs, "35 32 00 00". Never after a currency or a digit (an amount).
const PHONE_MOBILE = new RegExp(
  String.raw`(?<![\p{L}\p{N}$€£.,\/:-])(?<![$€£][^\S\n]?)(?<!\d[^\S\n])(?:[67]\d{2}[ .-]\d{3}[ .-]\d{3}|3\d{2}[ .-]\d{3}[ .-]\d{3,4}|\d{2} \d{2} \d{2} \d{2})(?![\p{N}]|[.,-]\d|[^\S\n]?(?:€|eur|kr|sek|dkk|nok))`,
  'gu',
)

const digits = (value: string) => value.replace(/\D/g, '').length

// --- Names ----------------------------------------------------------------------------------

/**
 * A capitalised word with at least one lower-case letter (Smith, O'Brien, McDonald,
 * Müller-Lüdenscheidt); a possessive "'s" stays outside it.
 */
const CAPITALISED = String.raw`(?:\p{Lu}['’])?\p{Lu}(?=\p{L}{0,40}\p{Ll})\p{L}{1,40}(?!\p{L})`
const WORD = String.raw`${CAPITALISED}(?:-${CAPITALISED})?`
/** An initial: "J." */
const INITIAL = String.raw`\p{Lu}\.`
/** Words that join the parts of a name: "van der Berg", "de la Cruz", "bin Ali". */
const PARTICLE = String.raw`(?:van|von|de|der|den|di|da|del|della|du|la|le|ter|ten|zu|af|al|el|bin|ibn|dos|das|do)`
const PART = String.raw`(?:${WORD}|${INITIAL})`
/** Spaces or hyphens between the parts of a name, on one line. */
const GAP = String.raw`(?:[^\S\n]|-)+`
/** One to four parts. */
const NAME = String.raw`${PART}(?:${GAP}(?:${PARTICLE}[^\S\n]+)*${PART}){0,3}`
/** Two to four parts: a full name. */
const FULL_NAME = String.raw`${PART}(?:${GAP}(?:${PARTICLE}[^\S\n]+)*${PART}){1,3}`

// Specific forms first, so that "Prof." does not take the start of "Prof.ssa".
const TITLE = String.raw`(?:Prof\.ssa|Dr\.ssa|Dott\.(?:ssa)?|Prof\.ª|Profª|Profa\.|Drª|Dra\.|Profs\.|Drs\.|Prof(?:essor)?\.?|Dr\.?|PD|Priv\.-Doz\.|Univ\.-Prof\.|Mr\.?|Mrs\.?|Ms\.?|Mx\.?|Mme\.?|Mlle\.?|Pr\.?|Frau|Herrn?|Sig\.(?:ra)?|Ing\.|Doç\.|Sir|Dame|prof\.|dr\.|drs\.|ir\.|dhr\.|mevr\.|Öğr\.\s?Üyesi|Arş\.\s?Gör\.|Öğr\.\s?Gör\.)`
/** Degrees and titles that can follow the first title: "Prof. Dr. med.", "Dr. rer. nat.". */
const MORE_TITLES = String.raw`(?:\s+(?:Dr\.?|Prof\.?|dr\.|med\.|rer\.\s?nat\.|phil\.|habil\.|h\.\s?c\.|PhD|MD|Öğr\.\s?Üyesi)){0,4}`

const AFTER_TITLE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(${TITLE}${MORE_TITLES}\s+)(${NAME})`,
  'gu',
)

const BEFORE_GROUP = new RegExp(
  String.raw`(?<![\p{L}\p{N}\]])(${NAME})((?:'s|’s)?\s+(?:Lab|Labs|Laboratory|lab|labs|laboratory|Research Group|research group|Group|group|Team|team)(?![\p{L}\p{N}]))`,
  'gu',
)
// A lab named in one word: "DoeLab", "the RoeGroup".
const CAMEL_GROUP = /(?<![\p{L}\p{N}\]])(\p{Lu}\p{Ll}{2,})(?=(?:Lab|Labs|Group)(?![\p{L}\p{N}]))/gu

/**
 * `pattern` matching its letters in either case, without the `i` flag, which would make the
 * capitals of a name (`\p{Lu}`) match small letters too. Escapes (`\s`, `\[`) stay as they are.
 */
function anyCase(pattern: string): string {
  return pattern.replace(/\\.|(\p{L})/gu, (match, letter: string | undefined) => {
    if (!letter) return match
    const lower = letter.toLowerCase()
    const upper = letter.toUpperCase()
    return lower === upper ? letter : `[${lower}${upper}]`
  })
}

/**
 * Roles that people hold, folded into the patterns below (case-insensitive): before a name
 * ("Team Leader: Jane Doe", "recruitment adviser Jane Doe") and after one ("Jane Doe, HR
 * partner").
 */
const ROLES = [
  String.raw`(?:team|unit|group|lab|laboratory|project|research|section)\s+(?:leader|lead|head|director|manager|coordinator)`,
  String.raw`head\s+of\s+(?:the\s+)?(?:lab|laboratory|group|unit|team|department|division|section|research\s+group)`,
  String.raw`(?:HHMI\s+)?investigator`,
  'principal investigator',
  String.raw`(?:co-?)?supervisors?`,
  String.raw`recruit(?:er|ment\s+(?:adviser|advisor|consultant|officer|partner|specialist|coordinator|manager))`,
  String.raw`(?:HR|human\s+resources)(?:\s+business)?\s+(?:adviser|advisor|partner|officer|specialist|consultant|contact|generalist|coordinator|manager|administrator|representative)`,
  String.raw`personnel\s+(?:officer|administrator)`,
  String.raw`(?:trade\s+)?union\s+(?:representatives?|contacts?)`,
  String.raw`(?:hiring|reporting)\s+manager`,
  String.raw`contact\s+persons?`,
  String.raw`vacaturehouder`,
  String.raw`recruitmentadviseur`,
  String.raw`hr-adviseur`,
  String.raw`kontaktperson(?:er)?`,
  String.raw`fackliga?\s+(?:företrädare|representanter?)`,
  String.raw`(?:närmaste\s+)?chef`,
  String.raw`(?:projekt|gruppen)?leiter(?:in)?`,
  String.raw`betreuer(?:in)?`,
  String.raw`ansprechperson(?:en)?`,
  String.raw`responsabile(?:\s+scientifico)?`,
  String.raw`chef\s+d['’]équipe`,
  String.raw`(?:directeur|directrice)\s+de\s+(?:thèse|recherche|l['’]équipe)`,
  String.raw`responsable\s+(?:scientifique|de\s+l['’]équipe)`,
  String.raw`investigador(?:a)?\s+principal`,
  String.raw`jefe\s+de\s+grupo`,
  String.raw`orientador(?:a)?`,
  String.raw`(?:proje\s+)?yürütücü(?:sü)?`,
  String.raw`sorumlu\s+öğretim\s+üyesi`,
]
/** Roles that may also follow a name after a comma or a bracket ("Jane Doe, Professor"). */
const ROLES_AFTER = [
  ...ROLES,
  String.raw`(?:associate\s+|assistant\s+|full\s+|adjunct\s+)?professor`,
  String.raw`(?:senior\s+)?lecturer`,
  String.raw`(?:senior\s+)?researcher`,
  String.raw`postdoc(?:toral\s+(?:fellow|researcher))?`,
  String.raw`phd(?:\s+(?:student|candidate))?`,
  String.raw`md`,
  String.raw`docent`,
  String.raw`lektor`,
  String.raw`forskare`,
  String.raw`prefekt`,
  String.raw`(?:avdelnings|enhets)chef`,
  String.raw`studierektor`,
  String.raw`saco(?:-s)?`,
  String.raw`ofr`,
  String.raw`seko`,
  String.raw`(?:(?:lab|laboratory)\s+)?manager`,
  String.raw`administrator`,
  String.raw`coordinator`,
  String.raw`officer`,
  String.raw`adviser`,
  String.raw`advisor`,
  String.raw`consultant`,
  String.raw`director`,
  String.raw`chair`,
  String.raw`dean`,
  String.raw`tel(?:ephone)?\.?`,
  'phone',
  String.raw`e-?mail`,
  'mobile',
  String.raw`\[(?:email|phone)\]`,
  'pi',
  String.raw`ph\.?[^\S\n]?d\.?`,
  String.raw`m\.d\.`,
]

// Words that say a name follows, in any case; the name itself must be capitalised, so it is
// matched separately (NAME_AT) where the words end.
const LEAD_WORDS = [
  String.raw`(?:the\s+)?(?:laboratory|lab|group|team)\s+of`,
  String.raw`group\s+led\s+by`,
  String.raw`led\s+by`,
  String.raw`headed\s+by`,
  String.raw`supervised\s+by`,
  String.raw`(?:under\s+the\s+)?supervision\s+of`,
  'PI',
  String.raw`contacts?`,
  String.raw`please\s+contact`,
  String.raw`(?:informal\s+)?(?:enquiries|inquiries|questions)\s+[^.:\n]{0,40}?\bto`,
  String.raw`ansprechpartner(?:in)?`,
  'kontakt',
  'kontakta',
  String.raw`interlocut(?:eur|rice)`,
  'responsable',
  'referente',
  'tutor',
  String.raw`send\s+(?:your\s+)?applications?\s+to`,
  String.raw`addressed\s+to`,
  String.raw`contact\s+(?:op)?nemen\s+met`,
  String.raw`contact\s+op\s+met`,
  String.raw`wenden\s+sie\s+sich\s+(?:bitte\s+)?an`,
  String.raw`auskünfte\s+(?:erteilt|gibt)`,
  String.raw`upplysningar\s+(?:om\s+(?:tjänsten|anställningen)\s+)?(?:lämnas\s+av|ges\s+av)`,
  String.raw`för\s+(?:mer|ytterligare)\s+information(?:\s+kontakta)?`,
  String.raw`s['’]adresser\s+à`,
  String.raw`contacter`,
  String.raw`renseignements\s+auprès\s+de`,
  String.raw`contactar\s+con`,
  String.raw`dirigirse\s+a`,
  'contattare',
  String.raw`rivolgersi\s+a`,
  'irtibat',
  String.raw`iletişim`,
  String.raw`saco(?:-s)?`,
  'ofr',
  'seko',
  String.raw`fackförbundet\s+st`,
  // "PI Name: Jane Doe", "Name: Jane Doe".
  String.raw`(?:full\s+)?name(?=\s*:)`,
  String.raw`(?:your\s+)?(?:contact(?:\s+person)?|supervisor|PI)\s+(?:is|will\s+be)`,
  String.raw`(?:please\s+)?e-?mail`,
  String.raw`(?:head|director|chair|leader|manager|coordinator)\s+of\s+[^,.\n]{2,40},`,
  'contactez',
  'kontaktieren',
  String.raw`kontaktieren\s+sie`,
  'contatta',
  'contactar',
  ...ROLES,
]
// The longest words first, so that "contact opnemen met" is not taken for "contact". A name after
// a colon may stand on the next line; without one, on the same line ("Union representatives" on
// one line and "Saco-S: …" on the next are a heading and a line of its own).
const LEAD_IN = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${[...LEAD_WORDS].sort((a, b) => b.length - a.length).join('|')})(?:[^\S\n]*[:–-]\s*|[^\S\n]+)`,
  'giu',
)
/**
 * Words that make the name before them an institution's or a prize's: "Stockholm University",
 * "Sir Henry Dale Fellowship", "Boston Children's Hospital".
 */
const INSTITUTION_WORD =
  /^(?:university|universit[äaeé]t?|universiteit|universidad|università|universidade|universitet|institute|institut|institutet|instituto|istituto|hospital|college|school|centre|center|foundation|clinic|klinikum|academy|laboratory|laboratories|museum|society|fellowship|fellowships|award|awards|prize|prizes|lecture|medal|professorship|chair|scholarship|scholarships|building|hall|campus|trust|fund|programme|program)$/iu

/** Whether the words after a name found at `end` of `text` make it an institution's or a prize's. */
function eponymAhead(text: string, end: number): boolean {
  const next = /^(?:['’]s)?[^\S\n]+([\p{L}]+)/u.exec(text.slice(end, end + 60))
  return Boolean(next && INSTITUTION_WORD.test(next[1]!))
}

/** Roles a contact holds, which may follow a name after a dash ("Jane Doe – union representative"). */
const CONTACT_ROLES = [
  String.raw`recruit(?:er|ment\s+(?:adviser|advisor|consultant|officer|partner|specialist|coordinator|manager))`,
  String.raw`(?:HR|human\s+resources)(?:\s+business)?\s+(?:adviser|advisor|partner|officer|specialist|consultant|contact|generalist|coordinator|manager|administrator|representative)`,
  String.raw`(?:trade\s+)?union\s+(?:representatives?|contacts?)`,
  String.raw`saco(?:-s)?`,
  String.raw`ofr`,
  String.raw`seko`,
  String.raw`tel(?:ephone)?\.?`,
  'phone',
  String.raw`e-?mail`,
  'mobile',
  String.raw`\[(?:email|phone)\]`,
]

// A name followed by a role, after a comma, a bracket or a colon ("Jane Doe, HR partner", "Jane
// Doe (recruiter)", "Jane Doe, Ph.D."), or after a dash when the role is a contact's ("Jane Doe –
// union representative"): a title's "Los Angeles – Lab Manager" keeps its place. Two to four
// parts, so that a lone word before a comma ("Karolinska, …") is not taken.
const NAME_BEFORE_ROLE = new RegExp(
  String.raw`(?<![\p{L}\p{N}\]])(${FULL_NAME})(?=[^\S\n]*(?:(?:,|\(|:)[^\S\n]*(?:${ROLES_AFTER.map(anyCase).join('|')})|(?:–|—|-|\|)[^\S\n]*(?:${CONTACT_ROLES.map(anyCase).join('|')}))(?![\p{L}\p{N}]))`,
  'gu',
)

// Names joined to a name already replaced: "[name] and Jane Doe", "Doe and [name] Labs",
// "[name], Jane Roe", "Roe/[name] Lab".
const JOIN = String.raw`(?:[^\S\n]*\([^()\n]{1,40}\))?(?:\s*,\s*|\s+(?:and|or|und|et|y|e|och|og|en|ve|&)\s+|\s*[&\/]\s*)`
const LABS = String.raw`(?:Lab|Labs|Laboratory|Laboratories|Group|Groups|Team|lab|labs|laboratory|laboratories|group|groups|team)`
const JOINED_AFTER = new RegExp(
  String.raw`(\[name\]${JOIN})(${TITLE}${MORE_TITLES}[^\S\n]+)?(${NAME})((?:'s|’s)?[^\S\n]+${LABS}(?![\p{L}\p{N}]))?`,
  'gu',
)
const JOINED_BEFORE = new RegExp(
  String.raw`(?<![\p{L}\p{N}\]])(${NAME})(${JOIN}(?:${TITLE}${MORE_TITLES}[^\S\n]+)?\[name\])((?:'s|’s)?[^\S\n]+${LABS}(?![\p{L}\p{N}]))?`,
  'gu',
)

// Authors in a reference ("Doe and Roe, Curr. Opin. Neurobiol. (2023)", "Doe et al."): a posting's
// list of references names people as well as any contact does.
const CITED_PAIR = new RegExp(
  String.raw`(?<![\p{L}\p{N}\]])(${WORD})([^\S\n]+(?:and|&)[^\S\n]+)(${WORD})(?=,[^\S\n]+[^\n()]{2,100}\([^\S\n]?(?:19|20)\d{2}[^\S\n]?\))`,
  'gu',
)
const CITED_ET_AL = new RegExp(
  String.raw`(?<![\p{L}\p{N}\]])(${WORD})(?=[^\S\n]+et[^\S\n]+al\b)`,
  'gu',
)

// A person's initials in brackets after a project's name ("PhD position - READEXP (A.C.)", BCBL):
// two or three capitals with full stops, not a country's (U.S., U.K., E.U.) or a degree (M.D.).
const INITIALS = /(?<=\()(?:\p{Lu}\.[^\S\n]?){2,3}(?=\))/gu
const NOT_INITIALS = new Set([
  'U.S.',
  'U.S.A.',
  'U.K.',
  'E.U.',
  'U.A.E.',
  'P.R.',
  'D.C.',
  // Degrees and roles.
  'M.D.',
  'B.S.',
  'M.S.',
  'B.A.',
  'M.A.',
  'D.O.',
  'R.N.',
  'P.I.',
])

// A CNRS offer reference names the person who placed it, shortened: "UMR5293-JANDOE-001" (three
// letters of the first name and three of the surname).
const CNRS_REFERENCE =
  /(?<![\p{L}\p{N}])((?:UMR|UPR|UAR|UMS|IRL|FRE|USR|ERL|UR|EA)\d{2,5}-)[A-Z]{4,8}(-\d{2,4})(?![\p{L}\p{N}])/gu

/** Words in capitals right after a name found: "[name] DUPONT" (French and Italian style). */
const CAPS_AFTER_NAME = /\[name\](?:[^\S\n]+\p{Lu}{2,}(?:-\p{Lu}{2,})?)+(?![\p{L}\p{N}])/gu
/** A name in capitals after a title: "Prof. JANE DOE". */
const CAPS_AFTER_TITLE = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(${TITLE}${MORE_TITLES}[^\S\n]+)\p{Lu}{2,}(?:[^\S\n]+\p{Lu}{2,}){1,2}(?![\p{L}\p{N}])`,
  'gu',
)

const TITLE_AT = new RegExp(String.raw`${TITLE}${MORE_TITLES}\s+`, 'uy')
const NAME_AT = new RegExp(NAME, 'uy')
const NAME_EXACT = new RegExp(String.raw`^${NAME}$`, 'u')

/**
 * Capitalised words that are not names but often stand where one could: before "Lab" or "Group",
 * after "contact" or a role, at the start of a line, in headings written in title case. Compared in
 * lower case. Common surnames (Park, Hall, King, Young, West…) are left out on purpose.
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
  monday tuesday wednesday thursday friday saturday sunday
  us acquisition talent recruiting hiring leadership operations facilities communications finance financial
  administration administrative support service services quality safety compliance legal marketing sales
  product products benefits compensation diversity equity inclusion belonging accessibility accommodation
  accommodations employment equal affirmative action payroll procurement purchasing grants contracts
  sponsored programs initiative consortium study studies trial trials care
  about requirements qualifications responsibilities duties salary location deadline apply description
  summary overview details further more please note important job jobs role roles offer offers profile
  tasks task skills experience background environment working conditions terms start date duration contract
  full part time fixed term permanent temporary hours remote hybrid employer organization organisation
  company section campus key main essential desirable preferred required minimum additional other
  coordinator administrator officer specialist analyst engineer developer consultant representative partner
  adviser advisor recruiter chief leader lead member members staff employee employees intern internship
  trainee professor engineer technologist nurse physician clinician psychologist therapist doctor
  institutet institut instituto istituto universität universitat universiteit université universidad
  università universidade üniversitesi hospital hôpital klinikum klinik clinic clinics foundation fondation
  fundação fundación stiftung academy akademie medizin médecine harbor harbour spring cold valley mount
  neuro cog speech synapse synapses mind eye hand robotics sensor image behaviour decision reward control
  plasticity myelin axon cortex spike wave rhythm comp compneuro ai ml deep dev code math chem omics fly fish
  worm rat primate baby infant music award awards prize prizes scholar scholars scholarship scholarships
  grant competition pathway page pages form forms portal website site link links email e-mail phone address
  list person persons point points
  formular impressum datenschutz karriere stellenangebote bewerbung bewerbungen stelle stellen ausschreibung
  zentrum abteilung arbeitsgruppe forschung lehre wir sie ihre ihr uns unser unsere
  anställning tjänsten ansökan universitet institutionen avdelningen enheten vi du din ditt våra vår
  wij jij je jouw ons onze vacature afdeling sollicitatie umc
  nous vous votre notre poste candidature laboratoire équipe unité
  nosotros su puesto plaza convocatoria laboratorio equipo unidad nostro posizione bando gruppo vaga
  edital laboratório equipe duyuru ilan başvuru merkez merkezi enstitü enstitüsü laboratuvar araştırma
  bölüm bölümü birim kadro saco seko young investigator investigators atlas syndrome name names children
  childrens biomarker biomarkers dr drs prof profs professor mr mrs ms mx sir dame herr herrn frau mme mlle med phil rer nat habil`
    .split(/\s+/)
    .filter(Boolean),
)

/**
 * Names that stand for an institution, a programme or a prize rather than a person, before "Lab"
 * or "Group" ("Max Planck Research Group", "Cold Spring Harbor Laboratory"). Compared in lower case.
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
  'francis crick',
  'janelia',
  'wu tsai',
  'mcgovern',
  'picower',
  'zuckerman',
  'salk',
  'riken',
  'cold spring harbor',
  'jackson',
  'woods hole',
  'mount sinai',
  'sloan kettering',
  'memorial sloan kettering',
  'lawrence berkeley',
  'lawrence livermore',
  'los alamos',
  'argonne',
  'brookhaven',
  'oak ridge',
  'mayo',
  'scripps',
  'whitehead',
  'broad',
  'koch',
  'wyss',
  'stowers',
  'gladstone',
  'van andel',
  'lieber',
  'kennedy krieger',
  'chan zuckerberg',
  'san raffaele',
  'pasteur',
  'curie',
  'karolinska',
  'champalimaud',
  'donders',
  'bernstein',
  'ernst strüngmann',
  'friedrich miescher',
  'sanger',
  'wellcome sanger',
  'babraham',
  'rosalind franklin',
  'florey',
  'garvan',
  'cajal',
  'ramón y cajal',
  'severo ochoa',
  'mario negri',
  'max delbrück',
  'robert koch',
  'paul ehrlich',
  'else kröner',
  'klaus tschira',
  'wallenberg',
  'carlsberg',
  'lundbeck',
  'novo nordisk',
  'boehringer ingelheim',
  'volkswagen',
  'sloan',
  'searle',
  'klingenstein',
  'whitehall',
  'mcknight',
  'dana',
  'beckman',
  'packard',
  'rockefeller',
  'carnegie',
  'flatiron',
  'blavatnik',
  'sanford burnham prebys',
  'buck',
  'johns hopkins',
  'los angeles',
  'san francisco',
  'san diego',
  'santa cruz',
  'santa barbara',
  'hong kong',
  'tel aviv',
  'buenos aires',
  'rio de janeiro',
  'são paulo',
  'sao paulo',
  'ann arbor',
  'salt lake',
  'henry dale',
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
  // The words of `found` where NAME separates them: spaces, or hyphens between two words
  // ("Dr. Jane Doe--Center for …"); one hyphen inside a word joins it ("Müller-Lüdenscheidt").
  const words = [...found.matchAll(/[^\s-]+(?:-[^\s-]+)*/gu)]
  for (let size = words.length; size > 0; size--) {
    const first = from === 'start' ? words[0]! : words[words.length - size]!
    const last = from === 'start' ? words[size - 1]! : words[words.length - 1]!
    const part = found.slice(first.index, last.index + last[0].length)
    // A shorter run would be a part of an eponym ("Max Planck Group" is not "Max [name] Group").
    if (EPONYMS.has(part.toLowerCase())) return null
    if (looksLikeName(part)) return part
  }
  return null
}

// --- Contact blocks ---------------------------------------------------------------------------

/** A line that heads a block of contacts ("Contact persons", "Union representatives:"). */
const CONTACT_HEADING = new RegExp(
  String.raw`^\s*(?:contacts?|contact\s+(?:persons?|information|details)|(?:for\s+)?(?:further|more)\s+information(?:\s+(?:about|on)\s+the\s+(?:position|post|job|procedure))?|questions(?:\s+about\s+the\s+(?:position|post|job))?|enquiries|inquiries|(?:trade\s+)?unions?(?:\s+representatives?)?|union\s+representatives?|hr|human\s+resources|recruitment|kontakt(?:person(?:er)?)?|upplysningar|fackliga\s+företrädare|facklig\s+företrädare|ansprechpartner(?:in|innen)?|ansprechperson(?:en)?|interlocuteurs?|contacto|contactos|contatti|contatto|referenti|iletişim|bilgi\s+için)\s*:?\s*$`,
  'iu',
)
/** How many lines after a heading count as its block, at most. */
const BLOCK_LINES = 8
/**
 * A phone number in a contact block written without a word before it: it starts with "+" or "0"
 * ("08-524 800 00", "+46 8 524 800 00"), eight digits or more. A line about dates or money keeps
 * its numbers: "Closing date: 30.11.2026 23:59", "Salary: SEK 34 000 – 38 000".
 */
const BLOCK_NUMBER = /(?<![\p{L}\p{N}(])(?:\+|\(?0)\d[\d\s().\/–-]{6,}\d(?![\p{L}\p{N}])/gu
const DATES_OR_MONEY =
  /\b(?:date|dates|deadline|closing|closes|period|from|until|to|salary|salaries|pay|grade|sek|eur|euro|euros|usd|gbp|chf|dkk|nok|kr|per|month|year|annum|contract|start|tarih|maaş)\b|[€$£%]|\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}/iu
const LINE_START_NAME = new RegExp(
  String.raw`^([^\S\n]*(?:${TITLE}${MORE_TITLES}[^\S\n]+)?)(${FULL_NAME})(?=[^\S\n]*(?:$|,|\(|–|—|-|\||:|\[|\+|\d|(?:tel|phone|e-?mail|mob|tfn|telefon)\b))`,
  'u',
)

/**
 * The lines of contact blocks, with their names and numbers replaced: the lines after a contact
 * heading (up to a blank line after some content, or BLOCK_LINES), and every line whose name is
 * followed by an email address or a phone number on it or on the next two lines. The numbers of
 * every block are replaced first, so that a second run changes nothing.
 */
function redactContactBlocks(text: string, counts: RedactionCounts): string {
  const lines = text.split('\n')
  const inBlock = new Array<boolean>(lines.length).fill(false)
  let block = 0
  let seen = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (CONTACT_HEADING.test(line)) {
      block = BLOCK_LINES
      seen = false
      continue
    }
    if (block === 0) continue
    if (line.trim() === '') {
      if (seen) block = 0
      continue
    }
    // A long line is ordinary text again.
    if (line.length > 200) {
      block = 0
      continue
    }
    block--
    seen = true
    inBlock[i] = true
    if (DATES_OR_MONEY.test(line)) continue
    lines[i] = line.replace(BLOCK_NUMBER, (match) => {
      if (digits(match) < 8) return match
      counts.phone++
      return PLACEHOLDER.phone
    })
  }
  const near = (index: number) =>
    lines.slice(index, index + 3).some((line) => /\[(?:email|phone)\]/.test(line))
  for (let i = 0; i < lines.length; i++) {
    if (!inBlock[i] && !near(i)) continue
    const current = lines[i]!
    const found = LINE_START_NAME.exec(current)
    if (found && found[2]!.split(/\s+/).length >= 2 && looksLikeName(found[2]!)) {
      counts.name++
      lines[i] = found[1]! + PLACEHOLDER.name + current.slice(found[1]!.length + found[2]!.length)
    }
  }
  return lines.join('\n')
}

// --- The function -----------------------------------------------------------------------------

/**
 * `input` with email addresses, phone numbers, web addresses and file names, and the names the
 * rules can find, replaced by placeholders, and how many of each were replaced. The rules run again
 * until nothing changes (a name can show only once its neighbour is replaced: "Doe and [name]"),
 * at most three times, so that redacting a redacted text changes nothing.
 */
export function redact(input: string): Redaction {
  const counts = emptyCounts()
  let text = input
  for (let pass = 0; pass < 3; pass++) {
    const once = redactOnce(text)
    for (const key of Object.keys(counts) as (keyof RedactionCounts)[])
      counts[key] += once.counts[key]
    if (once.text === text) break
    text = once.text
  }
  return { text, counts }
}

function redactOnce(input: string): Redaction {
  const counts = emptyCounts()
  let text = input.normalize('NFC')

  for (const pattern of [EMAIL, EMAIL_WORDS, EMAIL_DOT_WORDS]) {
    text = text.replace(pattern, () => {
      counts.email++
      return PLACEHOLDER.email
    })
  }

  for (const pattern of [URL_WITH_SCHEME, URL_WWW, HOST, FILE]) {
    text = text.replace(pattern, (match) => {
      const { rest } = trimmed(match)
      counts.link++
      return `${PLACEHOLDER.link}${rest}`
    })
  }

  text = text.replace(PHONE_AFTER_WORD, (match, word: string, number: string) => {
    if (digits(number) < 6) return match
    counts.phone++
    return `${word}${PLACEHOLDER.phone}`
  })
  for (const [pattern, fewest, most] of [
    [PHONE_INTERNATIONAL, 9, 15],
    [PHONE_NATIONAL, 9, 15],
    [PHONE_PAIRS, 10, 10],
    [PHONE_NANP, 10, 11],
    [PHONE_MOBILE, 8, 10],
  ] as const) {
    text = text.replace(pattern, (match) => {
      const count = digits(match)
      if (count < fewest || count > most) return match
      counts.phone++
      return PLACEHOLDER.phone
    })
  }

  text = text.replace(CITED_PAIR, (match, first: string, join: string, second: string) => {
    if (!looksLikeName(first) || !looksLikeName(second)) return match
    counts.name += 2
    return `${PLACEHOLDER.name}${join}${PLACEHOLDER.name}`
  })
  text = text.replace(CITED_ET_AL, (match) => {
    if (!looksLikeName(match)) return match
    counts.name++
    return PLACEHOLDER.name
  })
  text = text.replace(CNRS_REFERENCE, (_match, before: string, after: string) => {
    counts.name++
    return `${before}${PLACEHOLDER.name}${after}`
  })
  text = text.replace(
    AFTER_TITLE,
    (match, title: string, found: string, at: number, all: string) => {
      const person = nameIn(found, 'start')
      const end = at + title.length
      if (
        !person ||
        eponymAhead(all, end + person.length) ||
        eponymAhead(all, end + found.length)
      ) {
        return match
      }
      counts.name++
      return `${title}${PLACEHOLDER.name}${found.slice(person.length)}`
    },
  )
  text = text.replace(BEFORE_GROUP, (match, found: string, group: string) => {
    const person = nameIn(found, 'end')
    if (!person) return match
    counts.name++
    return `${found.slice(0, found.length - person.length)}${PLACEHOLDER.name}${group}`
  })
  text = text.replace(CAMEL_GROUP, (match) => {
    if (!looksLikeName(match)) return match
    counts.name++
    return PLACEHOLDER.name
  })
  text = replaceAfterLeadIns(text, counts)
  text = text.replace(NAME_BEFORE_ROLE, (match) => {
    const person = nameIn(match, 'end')
    if (!person || person !== match || person.split(/\s+/).length < 2) return match
    counts.name++
    return PLACEHOLDER.name
  })
  text = redactContactBlocks(text, counts)
  text = text.replace(INITIALS, (match) => {
    if (NOT_INITIALS.has(match.replace(/\s/g, ''))) return match
    counts.name++
    return PLACEHOLDER.name
  })
  text = text.replace(CAPS_AFTER_TITLE, (_match, title: string) => {
    counts.name++
    return `${title}${PLACEHOLDER.name}`
  })
  text = text.replace(CAPS_AFTER_NAME, () => PLACEHOLDER.name)
  text = replaceJoinedNames(text, counts)

  return { text, counts }
}

/** Names after the words of LEAD_IN ("please contact Jane Doe", "Team Leader: Taro Yamada"). */
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
    // "supervised by Stockholm University": a place's name before an institution's word.
    if (
      !person ||
      eponymAhead(text, at + person.length) ||
      eponymAhead(text, at + found![0].length)
    ) {
      continue
    }
    result += text.slice(done, at) + PLACEHOLDER.name
    done = at + person.length
    counts.name++
  }
  return result + text.slice(done)
}

/** Names joined to a name already replaced ("[name] and Jane Doe"), until none is left. */
function replaceJoinedNames(text: string, counts: RedactionCounts): string {
  for (let round = 0; round < 5; round++) {
    const before = counts.name
    // A joined name counts when a title marks it, when it is a full name, or when it names a
    // lab: "[name] and Stockholm University" keeps its university.
    const joined = (found: string, title: string | undefined, lab: string | undefined) =>
      looksLikeName(found) && (Boolean(title) || Boolean(lab) || found.split(/\s+/).length >= 2)
    text = text.replace(
      JOINED_AFTER,
      (match, lead: string, title: string | undefined, found: string, lab: string | undefined) => {
        if (!joined(found, title, lab)) return match
        counts.name++
        return `${lead}${title ?? ''}${PLACEHOLDER.name}${lab ?? ''}`
      },
    )
    text = text.replace(
      JOINED_BEFORE,
      (match, found: string, rest: string, lab: string | undefined) => {
        if (!joined(found, undefined, lab)) return match
        counts.name++
        return `${PLACEHOLDER.name}${rest}${lab ?? ''}`
      },
    )
    if (counts.name === before) break
  }
  return text
}

/**
 * Scripts without capital letters, where redaction cannot find names (it finds them by their
 * capitals and the words around them, PLAN §6.6): Chinese, Japanese, Korean, Arabic, Hebrew, Thai,
 * the Indic scripts and others.
 */
const CASELESS = new RegExp(
  `[${[
    'Han',
    'Hiragana',
    'Katakana',
    'Hangul',
    'Arabic',
    'Hebrew',
    'Syriac',
    'Thaana',
    'Thai',
    'Lao',
    'Khmer',
    'Myanmar',
    'Tibetan',
    'Devanagari',
    'Bengali',
    'Gurmukhi',
    'Gujarati',
    'Oriya',
    'Tamil',
    'Telugu',
    'Kannada',
    'Malayalam',
    'Sinhala',
    'Ethiopic',
    'Georgian',
  ]
    .map((script) => `\\p{Script=${script}}`)
    .join('')}]`,
  'u',
)

/** Whether `text` is written partly in a script whose names redaction cannot find (`CASELESS`). */
export function inCaselessScript(text: string): boolean {
  return CASELESS.test(text)
}

/** `input` redacted, or null for an empty value. */
export function redacted(input: string | null | undefined): string | null {
  if (input == null || input.trim() === '') return null
  return redact(input).text
}
