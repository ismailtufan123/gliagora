import type { CollectionConfig } from 'payload'

import { HIDDEN_RECORDS } from '../hidden'

/** What an email link does; a token is used only for its own purpose. */
export const EMAIL_TOKEN_PURPOSES = [
  'sign-in',
  'verify-email',
  'data-request',
  'newsletter',
] as const
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number]

// The links the site emails (M4b, D49; PLAN §18.1): signing in (15 minutes), adding an address to
// an account (24 hours, bound to the member who asked), confirming a data request (24 hours) and,
// from M2 (D50), confirming a Glia Notes signup (7 days): until it is confirmed, a signup is only
// this row, so listmonk never holds an unconfirmed address.
// Each is used once: using it deletes the row, in one statement that also checks its purpose and
// expiry (src/lib/members/store.ts). Opening a link only looks it up, so mail scanners that follow
// links use up nothing. The row holds the SHA-256 of the token, never the token, and backups leave
// the rows out (deploy/backup/backup.sh): a restore revives no link.
export const EmailTokens: CollectionConfig = {
  slug: 'email-tokens',
  labels: { singular: 'Email link', plural: 'Email links' },
  ...HIDDEN_RECORDS,
  fields: [
    { name: 'tokenHash', type: 'text', required: true, unique: true },
    {
      name: 'purpose',
      type: 'select',
      required: true,
      options: EMAIL_TOKEN_PURPOSES.map((value) => ({ value, label: value })),
    },
    // Where the email went (stored lowercased), and the address the link proves.
    { name: 'email', type: 'email', required: true },
    // `verify-email`: the member who asked; only that member's session can use the link.
    { name: 'member', type: 'relationship', relationTo: 'members', index: true },
    // `sign-in`: SHA-256 of the binding in the requesting browser's sign-in cookie, so a link
    // opened elsewhere shows a warning.
    { name: 'browserHash', type: 'text' },
    // `data-request`: the minimal record made when the form was sent.
    { name: 'request', type: 'relationship', relationTo: 'data-requests' },
    // Where sign-in leads afterwards, and the job it saves (src/lib/members/return-path.ts).
    { name: 'next', type: 'text', maxLength: 1000 },
    { name: 'save', type: 'text', maxLength: 20 },
    {
      name: 'locale',
      type: 'select',
      required: true,
      defaultValue: 'en',
      options: [
        { value: 'en', label: 'English' },
        { value: 'tr', label: 'Türkçe' },
      ],
    },
    // `data-request`: what the form said ({ kind, details, name }), copied into the request only
    // once the person confirms it. Kept at most 24 hours. `newsletter`: the version of the consent
    // text agreed to, the form and when it was sent ({ version, source, requestedAt }), copied into
    // the consent records once the person confirms (a database constraint requires exactly these).
    { name: 'requestData', type: 'json' },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}
