import { describe, expect, it } from 'vitest'

import { PLACEHOLDER, redact, redacted } from './redact'

// Invented people, addresses and numbers only (CLAUDE.md: no real personal data in tests).

describe('redact: email addresses', () => {
  it('replaces plain, mailto and written-out addresses', () => {
    const { text, counts } = redact(
      'Write to jane.doe@example.org, mailto:lab-office@neuro.example.ac.uk or j.roe [at] example [dot] edu.',
    )
    expect(text).toBe(
      `Write to ${PLACEHOLDER.email}, ${PLACEHOLDER.email} or ${PLACEHOLDER.email}.`,
    )
    expect(counts.email).toBe(3)
  })

  it('handles addresses with accents and (at)', () => {
    expect(redact('Kontakt: müller(at)example.de').text).toBe(`Kontakt: ${PLACEHOLDER.email}`)
  })
})

describe('redact: phone numbers', () => {
  it('replaces numbers after a word that names them', () => {
    expect(redact('Tel.: 030 4505 1234').text).toBe(`Tel.: ${PLACEHOLDER.phone}`)
    expect(redact('Phone number: (030) 450-51234').text).toBe(`Phone number: ${PLACEHOLDER.phone}`)
    expect(redact('Téléphone : 01 23 45 67 89').text).toBe(`Téléphone : ${PLACEHOLDER.phone}`)
  })

  it('replaces international and grouped national numbers', () => {
    expect(redact('Call +44 20 7946 0000 or 0049 30 1234 5678.').text).toBe(
      `Call ${PLACEHOLDER.phone} or ${PLACEHOLDER.phone}.`,
    )
    expect(redact('Reception: 020 7946 0000.').text).toBe(`Reception: ${PLACEHOLDER.phone}.`)
  })

  it('leaves dates, salaries, years and reference numbers alone', () => {
    const keep = [
      'Closing date: 03.11.2026',
      'Deadline 2026-11-03, 23:59 CET',
      'Salary £38,205 – £46,021 per annum',
      'Grade 7, reference 1234567',
      'Start between 2026 and 2027',
      'Funded for 36 months from 01 10 2026',
      'Vacancy number 2026/0815',
    ]
    for (const value of keep) expect(redact(value).text).toBe(value)
  })
})

describe('redact: names', () => {
  it('replaces names after titles, keeping the title', () => {
    expect(redact('The project is led by Prof. Jane Doe.').text).toBe(
      `The project is led by Prof. ${PLACEHOLDER.name}.`,
    )
    expect(redact('Supervisor: Prof. Dr. med. Hans-Peter Beispiel').text).toBe(
      `Supervisor: Prof. Dr. med. ${PLACEHOLDER.name}`,
    )
    expect(redact('Dr J. Roe will answer questions.').text).toBe(
      `Dr ${PLACEHOLDER.name} will answer questions.`,
    )
    expect(redact('Join Dr. Maria van der Berg in Leiden').text).toBe(
      `Join Dr. ${PLACEHOLDER.name} in Leiden`,
    )
    // A title joined to the employer's name by two hyphens (CEBSIT's titles, M7 second round).
    expect(
      redact(
        'Lab Manager Position in the lab of Dr. Jane Kapoor--Center for Excellence in Brain Science',
      ).text,
    ).toBe(
      `Lab Manager Position in the lab of Dr. ${PLACEHOLDER.name}--Center for Excellence in Brain Science`,
    )
    expect(redact('Prof. Anna Müller-Lüdenscheidt leads it').text).toBe(
      `Prof. ${PLACEHOLDER.name} leads it`,
    )
  })

  it("replaces a person's initials in brackets, not a country's", () => {
    expect(redact('PhD position - READEXP (A.C.)').text).toBe(
      `PhD position - READEXP (${PLACEHOLDER.name})`,
    )
    expect(redact('Postdoc (J. R. T.) in Leipzig').text).toBe(
      `Postdoc (${PLACEHOLDER.name}) in Leipzig`,
    )
    expect(redact('Funded by the NIH (U.S.)').text).toBe('Funded by the NIH (U.S.)')
    expect(redact('Physician-scientist (M.D.) in Ohio (U.S.A.)').text).toBe(
      'Physician-scientist (M.D.) in Ohio (U.S.A.)',
    )
    expect(redact('Postdoc (m/f/d)').text).toBe('Postdoc (m/f/d)')
  })

  it('replaces the name of a lab or group, not its topic', () => {
    expect(redact('a PhD position in the Doe Lab').text).toBe(
      `a PhD position in the ${PLACEHOLDER.name} Lab`,
    )
    expect(redact("in Jane Roe's group at the institute").text).toBe(
      `in ${PLACEHOLDER.name}'s group at the institute`,
    )
    expect(redact('the Cognitive Neuroscience Lab').text).toBe('the Cognitive Neuroscience Lab')
    expect(redact('a Max Planck Research Group').text).toBe('a Max Planck Research Group')
    expect(redact('the Neural Circuits Group').text).toBe('the Neural Circuits Group')
  })

  it('keeps a topic before the name of a lab', () => {
    expect(redact('Systems Neuroscience Doe Lab').text).toBe(
      `Systems Neuroscience ${PLACEHOLDER.name} Lab`,
    )
  })

  it('replaces names after words that announce them', () => {
    expect(redact('For more information, please contact Jane Doe.').text).toBe(
      `For more information, please contact ${PLACEHOLDER.name}.`,
    )
    expect(redact('Informal enquiries may be addressed to John Q. Roe.').text).toBe(
      `Informal enquiries may be addressed to ${PLACEHOLDER.name}.`,
    )
    expect(redact('The student will be supervised by Prof Ann Example and Dr Bo Test.').text).toBe(
      `The student will be supervised by Prof ${PLACEHOLDER.name} and Dr ${PLACEHOLDER.name}.`,
    )
    expect(redact('Ansprechpartnerin: Erika Mustermann').text).toBe(
      `Ansprechpartnerin: ${PLACEHOLDER.name}`,
    )
  })

  it('leaves words after "contact" alone when they are not a name', () => {
    for (const value of [
      'please contact us for details',
      'contact the HR team',
      'Contact: Human Resources',
      'Please contact Recruitment',
    ]) {
      expect(redact(value).text).toBe(value)
    }
  })

  it('leaves titles of positions and institutes alone', () => {
    for (const value of [
      'Assistant Professor of Neuroscience',
      'Professor Position in Systems Neuroscience',
      'Max Planck Institute for Brain Research',
      'Postdoctoral Researcher (m/f/d) in Computational Neuroscience',
      'Sainsbury Wellcome Centre',
    ]) {
      expect(redact(value).text).toBe(value)
    }
  })
})

describe('redact: as a whole', () => {
  const posting = [
    'PhD position in the Doe Lab (Glial biology)',
    'Applications to jane.doe@example.org by 3 November 2026.',
    'For questions, please contact Dr. Jane Doe (Tel. +49 30 1234 5678).',
  ].join('\n')

  it('counts what it replaced', () => {
    expect(redact(posting).counts).toEqual({ email: 1, phone: 1, name: 2, link: 0 })
  })

  it('changes nothing when it runs again', () => {
    const once = redact(posting).text
    expect(redact(once)).toEqual({ text: once, counts: { email: 0, phone: 0, name: 0, link: 0 } })
  })

  it('gives null for an empty value', () => {
    expect(redacted(null)).toBeNull()
    expect(redacted('   ')).toBeNull()
    expect(redacted('Mail x@example.org')).toBe(`Mail ${PLACEHOLDER.email}`)
  })
})

// The second round (2026-10-22, M7 notes, third round): what the first weekly AI drafts found. Every
// pattern with invented examples, those that must go and those that must stay.
describe('redact: second round', () => {
  const { email, phone, name, link } = PLACEHOLDER
  const gone = (input: string, expected: string) => expect(redact(input).text).toBe(expected)
  const kept = (input: string) => expect(redact(input).text).toBe(input)

  it('replaces HR and union contact blocks with their phone numbers', () => {
    gone(
      [
        'Contact persons',
        'Anna Exempelsson, HR partner',
        '08-524 800 00',
        'anna.exempelsson@example.se',
        '',
        'Union representatives',
        'Saco-S: Bertil Provsson, 08-524 800 01',
        'OFR: Cecilia Testlund',
        '',
        'We welcome applicants of every background.',
      ].join('\n'),
      [
        'Contact persons',
        `${name}, HR partner`,
        phone,
        email,
        '',
        'Union representatives',
        `Saco-S: ${name}, ${phone}`,
        `OFR: ${name}`,
        '',
        'We welcome applicants of every background.',
      ].join('\n'),
    )
    gone(
      'For further information regarding the position: Dana Provsdotter, Senior lecturer, +46 31-786 0000',
      `For further information regarding the position: ${name}, Senior lecturer, ${phone}`,
    )
    gone('Kontaktperson: Erik Exempel, tfn 031-786 1234', `Kontaktperson: ${name}, tfn ${phone}`)
    gone(
      'Upplysningar om anställningen lämnas av Frida Prov, telefon 018-471 0000.',
      `Upplysningar om anställningen lämnas av ${name}, telefon ${phone}.`,
    )
  })

  it('keeps the dates and ordinary lines of a contact block', () => {
    kept('Contact\nApplication deadline 2026-11-03\nReference number 2026/123')
    kept('Further information\nThe position starts on 01.02.2027.')
  })

  it('replaces recruitment advisers before and after their role', () => {
    gone(
      'For questions about the procedure, contact recruitment adviser Gerda Voorbeeld.',
      `For questions about the procedure, contact recruitment adviser ${name}.`,
    )
    gone('Hanna Proefje (recruiter) will answer.', `${name} (recruiter) will answer.`)
    gone(
      'Voor meer informatie kun je contact opnemen met Ivo Testman.',
      `Voor meer informatie kun je contact opnemen met ${name}.`,
    )
    gone('HR adviser: Jan Steekproef', `HR adviser: ${name}`)
  })

  it('replaces "Team Leader:" and "Unit Leader:" lines', () => {
    gone('Team Leader: Taro Tameshi', `Team Leader: ${name}`)
    gone('Unit Leader : Hanako Shiken', `Unit Leader : ${name}`)
    gone(
      'Laboratory for Neural Dynamics (Team Leader: Jiro Rei)',
      `Laboratory for Neural Dynamics (Team Leader: ${name})`,
    )
    gone('Principal investigator Mira Example', `Principal investigator ${name}`)
    gone('HHMI Investigator Ola Normann leads the lab.', `HHMI Investigator ${name} leads the lab.`)
  })

  it('replaces names inside lab names', () => {
    gone('Research Specialist (Doe Lab)', `Research Specialist (${name} Lab)`)
    gone('in the Doe and Roe Labs at the campus', `in the ${name} and ${name} Labs at the campus`)
    gone('Lab Manager, Svoboda/Roe Lab', `Lab Manager, ${name}/${name} Lab`)
    gone('Join the DoeLab at the institute', `Join the ${name}Lab at the institute`)
    gone(
      'Postdoctoral Fellow - Example Lab, Department of Neurology',
      `Postdoctoral Fellow - ${name} Lab, Department of Neurology`,
    )
    kept('the NeuroLab and the MemoryLab')
  })

  it('replaces web addresses and file names, which can carry names', () => {
    gone('See https://doelab.example.edu/people/jane-doe.', `See ${link}.`)
    gone('More at www.roe-lab.example.org or doelab.example.org/join', `More at ${link} or ${link}`)
    gone('Download Bando_Rossi_2026.pdf and Annex-B.docx', `Download ${link} and ${link}`)
    kept('PhD (m/f/d), 3.5 years, e.g. in Berlin; i.e. full time')
  })

  it('replaces the shortened name in a CNRS offer reference', () => {
    gone('Reference: UMR5293-JANDOE-001', `Reference: UMR5293-${name}-001`)
    gone('Offer UPR3212-ALIROE-015 in Marseille', `Offer UPR3212-${name}-015 in Marseille`)
    kept('Funded by ANR-22-CE37-0001')
  })

  it("replaces SISSA's titles and supervisors", () => {
    gone(
      'Research fellowship in neuroscience - Supervisor Prof.ssa Maria Esempio',
      `Research fellowship in neuroscience - Supervisor Prof.ssa ${name}`,
    )
    gone('Responsabile scientifico: Luca Prova', `Responsabile scientifico: ${name}`)
    gone('tutor Dott.ssa Anna Campione', `tutor Dott.ssa ${name}`)
  })

  it('replaces more titles', () => {
    gone('prof. dr. Pieter Voorbeeld leads it', `prof. dr. ${name} leads it`)
    gone('Contact Mme Claire Exemple', `Contact Mme ${name}`)
    gone('Dra. Lucia Ejemplo dirige el grupo', `Dra. ${name} dirige el grupo`)
    gone('Frau Erika Beispiel beantwortet Fragen', `Frau ${name} beantwortet Fragen`)
  })

  it('replaces phone numbers it missed', () => {
    gone('Call (415) 555-0100 or 415-555-0101.', `Call ${phone} or ${phone}.`)
    gone('Office: 415.555.0102', `Office: ${phone}`)
    gone('Tél. 01.23.45.67.89', `Tél. ${phone}`)
    gone('Sekretariat 0761/203-1234', `Sekretariat ${phone}`)
    gone('Segreteria 040 3787111', `Segreteria ${phone}`)
    gone('Bel 020 - 566 9111', `Bel ${phone}`)
    gone('Direct line 07700 900123', `Direct line ${phone}`)
  })

  it('keeps numbers that are not phone numbers', () => {
    for (const value of [
      'Salary SEK 100 000 – 120 000 per month',
      'Salary $125,000 - $150,000',
      'From 01.10.2026 - 31.12.2026',
      'From 01/10/2026 to 31/12/2026',
      'Job ID 2026-123-4567',
      'Grade 7 (£38,205 – £46,021)',
    ]) {
      kept(value)
    }
  })

  it('replaces obfuscated email addresses', () => {
    gone('Write to jane.doe(a)example.fi', `Write to ${email}`)
    gone('Write to jane.doe @ example.org', `Write to ${email}`)
    gone('Write to jane.doe at example dot org', `Write to ${email}`)
    gone("Write to o'brien@example.ie", `Write to ${email}`)
    gone('Write to jane.doe＠example.jp', `Write to ${email}`)
    kept('Apply at example.org/jobs'.replace('example.org/jobs', 'the employer'))
  })

  it('replaces a name next to its email address', () => {
    gone('Jane Exemplar (jane.exemplar@example.org)', `${name} (${email})`)
    gone('Jane Exemplar\njane.exemplar@example.org', `${name}\n${email}`)
  })

  it('keeps institutions and ordinary capitalised words', () => {
    for (const value of [
      'Cold Spring Harbor Laboratory',
      'The Jackson Laboratory',
      'Contact Us',
      "Please contact the Allen Institute's Talent Acquisition Team",
      'Join our People Operations Team',
      'Investigator Award holders',
      'a collaboration with the Mount Sinai Hospital',
      'supervised by Stockholm University and Karolinska Institutet',
    ]) {
      kept(value)
    }
  })

  it('keeps a place after a name', () => {
    gone('led by Dr. Jane Exemplar, Stockholm', `led by Dr. ${name}, Stockholm`)
  })

  it('redacts titles as well as texts', () => {
    gone('Postdoc in the lab of Dr. Jane Exemplar', `Postdoc in the lab of Dr. ${name}`)
    gone('PhD student – Exemplar Group', `PhD student – ${name} Group`)
  })

  it('changes nothing when it runs again', () => {
    const once = redact(
      'Contact persons\nAnna Exempelsson, HR partner, 08-524 800 00\nSee https://doelab.example.edu.',
    ).text
    expect(redact(once).text).toBe(once)
  })

  it('stays fast on long runs of capitals, hyphens and digits', () => {
    // Each alone, 20,000 characters or more: a pattern that tried again from every character of a
    // run would take seconds on one of them.
    for (const long of [
      'Aa '.repeat(20000),
      'Aa-'.repeat(20000),
      'a.'.repeat(20000),
      'abc-def.'.repeat(5000),
      'a_'.repeat(20000),
      '('.repeat(20000),
      'UMR1234-'.repeat(10000),
      '1 '.repeat(20000),
      'Jane Doe and '.repeat(5000),
      'Jane Doe, '.repeat(5000),
      'Team Leader: '.repeat(5000),
      'jane.doe at '.repeat(5000),
    ]) {
      const started = performance.now()
      redact(long)
      expect(performance.now() - started, long.slice(0, 12)).toBeLessThan(500)
    }
  })
})
