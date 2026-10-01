import type { CollectionConfig } from 'payload'

import { isOrcidId } from '@/lib/members/orcid-id'
import { MAX_PREFERRED_SUBFIELDS } from '@/lib/retention/rules'

import { HIDDEN_RECORDS } from '../hidden'

// Member accounts on the public site (M4b, D7, D49; PLAN §5.1, §18.1). Never a Payload auth
// collection: `users` (the editors) stays the only one, so a member can never reach the admin or
// Payload's API, and members sign in through their own module (src/lib/members/) with Google,
// ORCID or an email link, never with a password.
//
// The site's code writes these rows in SQL (src/lib/members/store.ts), which skips Payload's hooks
// and field checks, so the rules that matter are also constraints in the database (the raw-SQL
// migration after the generated one): at least one way in (an address, a Google account or an
// ORCID iD), and the address stored lowercased. The two providers are columns of their own, so a
// Google account or an iD belongs to at most one member (unique indexes); a third provider would be
// one more column.
export const Members: CollectionConfig = {
  slug: 'members',
  labels: { singular: 'Member', plural: 'Members' },
  ...HIDDEN_RECORDS,
  fields: [
    {
      // Only ever a verified address: from an email link, or a Google address Google is
      // authoritative for (src/lib/members/identity.ts). Trimmed, NFC and lowercased.
      name: 'email',
      type: 'email',
      unique: true,
      validate: (value: string | null | undefined) =>
        value && (value.length > 254 || value !== value.toLowerCase())
          ? 'Store the address lowercased, at most 254 characters.'
          : true,
    },
    { name: 'emailVerifiedAt', type: 'date' },
    {
      name: 'emailVerifiedBy',
      type: 'select',
      options: [
        { value: 'link', label: 'Email link' },
        { value: 'google', label: 'Google' },
      ],
    },
    // Google's `sub`: at most 255 printable characters.
    { name: 'googleId', type: 'text', unique: true, maxLength: 255 },
    {
      name: 'orcidId',
      type: 'text',
      unique: true,
      validate: (value: string | null | undefined) =>
        value && !isOrcidId(value) ? 'Not an ORCID iD.' : true,
    },
    // From the account settings, or the ORCID name if the member ticked the box at sign-up.
    { name: 'displayName', type: 'text', maxLength: 80 },
    // Glia Notes: the member's choice, stored now and synced to listmonk at M2 (PLAN §13).
    { name: 'digestOptIn', type: 'checkbox', defaultValue: false },
    { name: 'digestChangedAt', type: 'date' },
    // The date of the consent text (`CONTENT_PAGES.acikRiza.updated`) the member agreed to.
    { name: 'digestConsentVersion', type: 'text', maxLength: 40 },
    {
      // D35: the default subfield filter of the jobs list while signed in. Its rows
      // (`members_rels`) go with the member.
      name: 'subfieldPrefs',
      type: 'relationship',
      relationTo: 'terms',
      hasMany: true,
      maxRows: MAX_PREFERRED_SUBFIELDS,
      filterOptions: { vocabulary: { equals: 'subfield' } },
    },
    // Signing in, or using the site while signed in; updated at most once a day.
    { name: 'lastSeenAt', type: 'date', required: true, index: true },
    // The start of the 30 days after an inactivity warning (PLAN §18.1).
    { name: 'deletionWarnedAt', type: 'date', index: true },
    // The first time a warning was refused as "no such address" (retried 7 days later).
    { name: 'warningRefusedAt', type: 'date' },
  ],
}
