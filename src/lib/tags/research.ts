import { fold } from './match'

// Whether a posting's title names a research or research-support position (M7, third round;
// D59's rule "a research or research-support position at a research employer"). The first weekly
// AI drafts (2026-10-22) showed what the neuroscience check lets through, above all from whole
// neuroscience institutes and medical centres: administrative posts, nursing, clinical residencies
// and clinical-only posts, teaching pools, business roles (partnerships, project management), and
// items that are no posting at all (unsolicited applications, calls for study participants,
// congresses, prizes). Judged by the title alone, which names the role; lab managers, technicians,
// animal caretakers, data scientists and research nurses' colleagues in research stay. A title
// that also names research ("Clinical Research Fellow", "Physician-Scientist") is kept.

export type NotResearchKind =
  'administrative' | 'nursing' | 'clinical' | 'teaching' | 'business' | 'not-a-posting'

export const NOT_RESEARCH_LABELS: Record<NotResearchKind, string> = {
  administrative: 'an administrative post',
  nursing: 'a nursing post',
  clinical: 'a clinical post (residency, clinical-only)',
  teaching: 'a teaching post (a teaching pool or a teaching-only line)',
  business: 'a business role (partnerships, project management)',
  'not-a-posting':
    'not a posting (an open application, a call for participants, an event, a prize)',
}

/** Words that make a title a research one whatever else it says. */
const RESEARCH =
  /\b(?:research(?:er|ers)?|scientist|scientific|postdoc\w*|post-doc\w*|ph\.?\s?d|doctoral|investigator|study|studies|trial|trials|forschung\w*|wissenschaftlich\w*|onderzoek\w*|forskare|forskning\w*|chercheu[rs]e?|recherche|investigador\w*|ricerca\w*|ricercator\w*|pesquisa\w*|pesquisador\w*|arastirma\w*|neuroscien\w*)\b/

/** Words that make a title a position, for the "not a posting" kinds. */
const POSITION =
  /\b(?:position|post|job|vacanc\w+|opening|fellow\w*|technician|engineer|assistant|associate|manager|officer|specialist|scientist|researcher|postdoc\w*|phd|student\w*|professor\w*|lecturer|stelle|doktorand\w*|tjanst|ilani|pozisyon\w*|kadro)\b/

const PATTERNS: Array<{ kind: NotResearchKind; regexp: RegExp; unlessResearch: boolean }> = [
  {
    kind: 'nursing',
    regexp:
      /\b(?:nurse|nurses|nursing|rn|midwife|sjukskoterska|verpleegkundige\w*|pflege\w*|krankenpfleger\w*|infirmier\w*|enfermer[oa]s?|enfermeir[oa]s?|infermier[ei]|hemsire)\b/,
    unlessResearch: false,
  },
  {
    kind: 'clinical',
    regexp:
      /\b(?:residen(?:t|ts|cy|cies)|registrar|house officer|medical officer|physician|physicians|psychiatrist|neurologist|neurosurgeon|neuroradiologist|radiologist|anesthesiologist|anaesthetist|hospitalist|attending|clinician(?!\s*-?\s*(?:scientist|investigator|researcher))|consultant (?:neurologist|psychiatrist|physician|neurosurgeon|in)|specialty doctor|specialist doctor|clinical (?:fellow|psychologist|neuropsychologist|assistant professor|associate professor|professor|faculty|instructor|educator)|clinician educator|psychotherapist|physiotherapist|occupational therapist|speech(?: and language)? therapist|pharmacist|radiographer|sonographer|(?:neurology|epilepsy|stroke|neurophysiology|neurocritical care|movement disorders|headache|neuromuscular|sleep medicine|psychiatry|child neurology|neuro-?oncology|neuroradiology)\s+fellowship|arzt|arztin|assistenzarzt\w*|facharzt\w*|oberarzt\w*|weiterbildung\w*|psychotherapeut\w*|arts-assistent|aios|anios|neuroloog|psychiater|basisarts|lakare|st-lakare|specialistlakare|overlakare|medecin|praticien\w*|medico|medicos|facultativo especialista|preceptor\w*|dirigente medico|specializzand[oi]|uzman hekim|asistan hekim|tipta uzmanlik)\b/,
    unlessResearch: true,
  },
  {
    kind: 'teaching',
    regexp:
      /\b(?:(?:lecturer|instructor|teaching|adjunct|faculty)s?\b[^,;]{0,30}\bpool|pool of (?:lecturers|instructors|adjuncts)|teaching[- ](?:focused|track|fellow|assistant|professor)|teaching and scholarship|education(?:al)?[- ]focused|professor of teaching|continuing lecturer|lecturer (?:pso|soe|with (?:potential )?security of employment)|lecturer \(teaching\))\b/,
    unlessResearch: false,
  },
  {
    kind: 'business',
    regexp:
      /\b(?:(?:head|director) of partnerships|partnerships? (?:manager|officer|lead|director|coordinator|executive|specialist|development)|business development|project manag(?:er|ers|ement)|programme manager|program manager|product manager|account manager|sales|marketing|fundraising|philanthrop\w*|development officer|alumni|technology transfer|licensing|contracts? (?:manager|officer)|grants? (?:manager|officer|administrator|advisor|adviser)|operations manager|chief operating|project (?:coordinator|officer|assistant)|program(?:me)? (?:coordinator|officer)|projektmanag\w*|projektkoordinat\w*|projektleiter\w*|beleidsmedewerker|projectleider|projectmanager|kommunikator|projektledare|charge(?:e)? de (?:communication|projet|mission)|jefe de proyecto|gestor de proyectos)\b/,
    unlessResearch: false,
  },
  {
    kind: 'administrative',
    regexp:
      /\b(?:administrat(?:or|ors|ive|ion)|secretar(?:y|ies|ial)|receptionist|office (?:manager|assistant|coordinator)|personal assistant|executive assistant|team assistant|pa to|clerk|bookkeeper|accountant|accounting|payroll|finance|financial|procurement|purchasing|hr (?:advisor|adviser|partner|officer|generalist|coordinator|assistant|manager|specialist)|human resources|recruiter|talent acquisition|communications (?:officer|manager|specialist|advisor|adviser)|events? (?:manager|coordinator|officer)|it (?:support|technician|administrator|manager|specialist)|help ?desk|service desk|facilities (?:management|manager|coordinator|officer|assistant|services)|(?:building|facility) maintenance|maintenance (?:worker|mechanic|electrician)|custodian|janitor|cleaner|security officer|porter|driver|catering|gardener|electrician|plumber|carpenter|verwaltung\w*|sachbearbeit\w*|sekretar\w*|sekretariat|teamassistenz|buroassistenz|assistenz der \w+|kaufm[a]nn\w*|buchhalt\w*|haustechnik|administrator|ekonom|handlaggare|sekreterare|lokalvardare|vaktmastare|secretaresse|managementassistent|secretaire|assistante? (?:administratif|administrative|de gestion)|gestionnaire|administrativ[oa]|auxiliar administrativ[oa]|secretari[oa]|amministrativ[oa]|segretari[oa]|idari|sekreter)\b/,
    unlessResearch: false,
  },
  {
    kind: 'not-a-posting',
    regexp:
      /\b(?:unsolicited|spontaneous application|open application|initiativbewerbung|blindbewerbung|candidature spontanee|candidatura espontanea|candidatura spontanea|talent pool|general application|expression of interest|call for (?:study )?participants|participants (?:wanted|needed|sought)|volunteers? (?:wanted|needed|sought)|study participants|katilimci\w*|gonullu\w*|congress|kongre\w*|symposium|sempozyum\w*|workshop|calistay\w*|summer school|winter school|seminar|webinar|conference|konferans\w*|award|awards|prize|prizes|winner|winners|odul\w*|ogrenci alim\w*|lisansustu (?:ogrenci )?(?:alim|basvuru)\w*|news|haber\w*|newsletter|bulten\w*|abstract book|bildiri kitab\w*|prosedur\w*|procedure|results? (?:announced|of the selection)|selection results|sonuclar\w*|graduatoria|esito|verbale|decreto di nomina|commissione giudicatrice)\b/,
    unlessResearch: false,
  },
]

/**
 * What kind of post `title` names that is not research or research support, with the words that
 * say so, or null. The order matters: a "Research Nurse" is nursing (D59: nursing posts are left
 * out), a "Clinical Research Fellow" is research.
 */
export function notResearch(title: string): { kind: NotResearchKind; words: string } | null {
  const folded = fold(title)
  const research = RESEARCH.test(folded)
  for (const { kind, regexp, unlessResearch } of PATTERNS) {
    if (unlessResearch && research) continue
    const match = regexp.exec(folded)
    if (!match) continue
    // An event or a prize named in a position's title ("Postdoc funded by the X Award") is a
    // posting all the same.
    if (kind === 'not-a-posting' && POSITION.test(folded)) continue
    return { kind, words: title.slice(match.index, match.index + match[0].length) }
  }
  return null
}
