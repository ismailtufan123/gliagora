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
    expect(redact(posting).counts).toEqual({ email: 1, phone: 1, name: 2 })
  })

  it('changes nothing when it runs again', () => {
    const once = redact(posting).text
    expect(redact(once)).toEqual({ text: once, counts: { email: 0, phone: 0, name: 0 } })
  })

  it('gives null for an empty value', () => {
    expect(redacted(null)).toBeNull()
    expect(redacted('   ')).toBeNull()
    expect(redacted('Mail x@example.org')).toBe(`Mail ${PLACEHOLDER.email}`)
  })
})
