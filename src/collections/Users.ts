import type { CollectionConfig } from 'payload'

import { signedIn } from '@/lib/access'

// Editor accounts for the Payload admin panel (/admin).
// Members who sign in on the public site (M4b) are stored separately.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  // Signed-in editors manage the accounts. Unlocking an account and entering the admin keep
  // Payload's own rules, which check the user too. While no account exists, Payload lets anyone
  // create the first one: at the first deploy that is the operator, behind the second password
  // (deploy/README.md, step 5).
  access: {
    read: signedIn,
    create: signedIn,
    update: signedIn,
    delete: signedIn,
  },
  auth: {
    // PLAN §18.2: lock the account for 15 minutes after 5 failed sign-ins.
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    // Rate-limited auth routes (PLAN §18.2): one password-reset email per account every 15
    // minutes. Payload's default (15 seconds) would let anyone send an editor thousands of emails
    // a day once email is set up (M2), each cancelling the reset link before it.
    forgotPassword: { minRequestInterval: 15 * 60 * 1000 },
    cookies: {
      sameSite: 'Strict',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  fields: [],
}
