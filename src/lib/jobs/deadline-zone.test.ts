import { describe, expect, it } from 'vitest'

import { fillOnAppear, followInstitution } from './deadline-zone'

describe('followInstitution (D40)', () => {
  it("fills an empty field with the new institution's zone", () => {
    expect(followInstitution(null, null, 'Europe/Stockholm')).toBe('Europe/Stockholm')
    expect(followInstitution(undefined, 'Europe/Berlin', 'Europe/Stockholm')).toBe(
      'Europe/Stockholm',
    )
    expect(followInstitution('', null, 'Europe/Stockholm')).toBe('Europe/Stockholm')
  })

  it("replaces the previous institution's zone", () => {
    expect(followInstitution('Europe/Berlin', 'Europe/Berlin', 'Europe/Stockholm')).toBe(
      'Europe/Stockholm',
    )
    // The new institution has no zone: the previous one's is not kept for it.
    expect(followInstitution('Europe/Berlin', 'Europe/Berlin', null)).toBeNull()
  })

  it('keeps a zone the editor chose', () => {
    expect(followInstitution('Asia/Tokyo', 'Europe/Berlin', 'Europe/Stockholm')).toBeUndefined()
    // Chosen before any institution was.
    expect(followInstitution('Asia/Tokyo', null, 'Europe/Stockholm')).toBeUndefined()
  })

  it('changes nothing when the zone stays the same', () => {
    expect(followInstitution('Europe/Istanbul', 'Europe/Istanbul', 'Europe/Istanbul')).toBe(
      undefined,
    )
    expect(followInstitution(null, null, null)).toBeUndefined()
  })
})

describe('fillOnAppear (D40)', () => {
  it('fills an empty field on a job not saved yet', () => {
    expect(fillOnAppear(null, undefined)).toBe(true)
    expect(fillOnAppear(null, { id: undefined, deadlineKind: 'fixed' })).toBe(true)
  })

  it('fills an empty field on a job saved with a rolling or open-ended deadline', () => {
    expect(fillOnAppear(null, { id: 4, deadlineKind: 'rolling' })).toBe(true)
    expect(fillOnAppear(undefined, { id: 4, deadlineKind: 'until-filled' })).toBe(true)
  })

  it('leaves a fixed deadline saved without a zone (Anywhere on Earth) as it is', () => {
    expect(fillOnAppear(null, { id: 4, deadlineKind: 'fixed' })).toBe(false)
    expect(fillOnAppear(null, { id: 4 })).toBe(false)
  })

  it('never replaces a zone', () => {
    expect(fillOnAppear('Europe/Berlin', undefined)).toBe(false)
    expect(fillOnAppear('Europe/Berlin', { id: 4, deadlineKind: 'rolling' })).toBe(false)
  })
})
