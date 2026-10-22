import { describe, expect, it } from 'vitest'

import { notResearch } from './research'

// Invented titles of the kinds the first weekly AI drafts found (M7, third round).
describe('notResearch', () => {
  const kind = (title: string) => notResearch(title)?.kind ?? null

  it('finds administrative posts', () => {
    for (const title of [
      'Administrative Assistant, Department of Neuroscience',
      'Office Manager (m/f/d)',
      'HR Advisor – Neuroscience Institute',
      'Finance Officer',
      'Sachbearbeiter*in Drittmittelverwaltung',
      'Teamassistenz im Institut für Neurologie',
      'Administratör till Institutionen för neurovetenskap',
      'Secrétaire de laboratoire',
    ]) {
      expect(kind(title), title).toBe('administrative')
    }
  })

  it('finds nursing posts', () => {
    for (const title of [
      'Registered Nurse, Neurology Ward',
      'Research Nurse – Memory Clinic',
      'Gesundheits- und Krankenpfleger (m/w/d) Stroke Unit',
      'Verpleegkundige Neurologie',
      'Enfermera de neurología',
    ]) {
      expect(kind(title), title).toBe('nursing')
    }
  })

  it('finds clinical residencies and clinical-only posts', () => {
    for (const title of [
      'Neurology Residency Program 2027',
      'Clinical Assistant Professor of Neurology',
      'Assistant Professor of Psychiatry (Clinician Educator)',
      'Staff Physician – Epilepsy',
      'Consultant Neurologist',
      'Epilepsy Fellowship 2027–2028',
      'Assistenzarzt/Assistenzärztin für Neurologie',
      'Clinical Psychologist, Memory Service',
      'Médico especialista en neurología',
      'Medical preceptor for the rehabilitation clinic',
    ]) {
      expect(kind(title), title).toBe('clinical')
    }
  })

  it('finds teaching pools and teaching-only lines', () => {
    for (const title of [
      'Lecturer Pool – Psychology and Neuroscience',
      'Adjunct Faculty Pool',
      'Teaching Fellow in Neuroscience',
      'Continuing Lecturer, Neurobiology',
      'Assistant Teaching Professor',
    ]) {
      expect(kind(title), title).toBe('teaching')
    }
  })

  it('finds business roles', () => {
    for (const title of [
      'Head of Partnerships',
      'Partnerships Manager, Brain Health',
      'Project Manager – Neuroscience Consortium',
      'Programme Coordinator, Graduate School',
      'Business Development Officer',
      'Projektkoordinator*in Exzellenzcluster',
    ]) {
      expect(kind(title), title).toBe('business')
    }
  })

  it('finds items that are no posting', () => {
    for (const title of [
      'Unsolicited application',
      'Initiativbewerbung',
      'Call for study participants: sleep and memory',
      'Ulusal Nörobilim Kongresi bildiri kitabı',
      'Gönüllü katılımcı aranıyor',
      'Winner of the 2026 Young Investigator Prize',
      'Summer School in Computational Neuroscience',
      'Lisansüstü öğrenci alımı 2026-2027',
    ]) {
      expect(kind(title), title).toBe('not-a-posting')
    }
  })

  it('keeps research and research-support posts', () => {
    for (const title of [
      'Postdoctoral Fellow in Systems Neuroscience',
      'PhD position: glial calcium signalling',
      'Research Technician (m/f/d)',
      'Lab Manager, Neural Circuits Lab',
      'Animal Caretaker / Tierpfleger (m/w/d)',
      'Technische Assistenz (MTA) Neurobiologie',
      'Clinical Research Coordinator, Memory Center',
      'Clinical Research Fellow in Neurology',
      'Physician-Scientist, Neurodegeneration',
      'Clinician Scientist Programme',
      'Assistant Professor of Neurology',
      'Lecturer in Cognitive Neuroscience',
      'Instructor in Neurology (research track)',
      'Data Scientist, Brain Imaging Core',
      'Workshop Technician',
      'Postdoc funded by the Young Investigator Award',
      'Study Coordinator, Sleep Study',
      'Imaging Core Facility Manager',
      'Postdoc in brain–computer interface controller design',
      'Research partnership postdoc with industry',
      // The independent review of 2026-10-22: a monitor's skip is final, so these stay for a decision.
      'Research Program Coordinator',
      'Research Project Coordinator',
      'Scientific Project Manager',
      'Wissenschaftliche/r Projektkoordinator/in',
      'Postdoctoral Fellow – Nursing Science',
      'Nurse Scientist',
      'Postdoc in the Carpenter Lab',
      'Technician, Porter Lab',
      'PhD position: neuroeconomics of financial decisions',
      'Research Assistant in consumer neuroscience and marketing',
      'Research Project Manager',
    ]) {
      expect(notResearch(title), title).toBeNull()
    }
  })

  it('names the words it found', () => {
    expect(notResearch('Registered Nurse, Neurology Ward')?.words).toBe('Nurse')
  })
})
