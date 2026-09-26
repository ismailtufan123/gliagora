import { describe, expect, it } from 'vitest'

import { Users } from './Users'

describe('Users (admin accounts)', () => {
  it('locks an account for 15 minutes after 5 failed sign-ins (PLAN §18.2)', () => {
    expect(Users.auth).toMatchObject({
      maxLoginAttempts: 5,
      lockTime: 15 * 60 * 1000,
    })
  })

  it('uses SameSite=Strict session cookies', () => {
    expect(Users.auth).toMatchObject({ cookies: { sameSite: 'Strict' } })
  })
})
