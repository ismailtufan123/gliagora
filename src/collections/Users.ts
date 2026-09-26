import type { CollectionConfig } from 'payload'

// Editor accounts for the Payload admin panel (/admin).
// Members who sign in on the public site (M4b) are stored separately.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    // PLAN §18.2: lock the account for 15 minutes after 5 failed sign-ins.
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    cookies: {
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  fields: [],
}
