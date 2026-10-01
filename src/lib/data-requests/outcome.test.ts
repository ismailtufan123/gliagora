import { describe, expect, it } from 'vitest'

import { deletionOutcome } from './outcome'

describe('deletionOutcome', () => {
  it('reads the stored counts', () => {
    expect(
      deletionOutcome({
        suggestionsDeleted: 2,
        accountDeleted: 1,
        reportAddressesCleared: 3,
        personalRightsReportsKept: 1,
      }),
    ).toEqual({
      suggestionsDeleted: 2,
      accountDeleted: 1,
      reportAddressesCleared: 3,
      personalRightsReportsKept: 1,
    })
  })

  it('reads anything else as nothing', () => {
    const none = {
      suggestionsDeleted: 0,
      accountDeleted: 0,
      reportAddressesCleared: 0,
      personalRightsReportsKept: 0,
    }
    expect(deletionOutcome(null)).toEqual(none)
    expect(deletionOutcome('2')).toEqual(none)
    expect(deletionOutcome({ accountDeleted: 1 })).toEqual({ ...none, accountDeleted: 1 })
    expect(
      deletionOutcome({
        suggestionsDeleted: -1,
        accountDeleted: 7,
        reportAddressesCleared: 1.5,
        personalRightsReportsKept: '3',
      }),
    ).toEqual({ ...none, accountDeleted: 1 })
  })
})
