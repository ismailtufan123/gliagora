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
    // Glia Notes: the member's choice, carried to listmonk by the task `syncGliaNotes` (M2, D50;
    // PLAN §13, src/lib/newsletter/members.ts).
    { name: 'digestOptIn', type: 'checkbox', defaultValue: false },
    { name: 'digestChangedAt', type: 'date' },
    // The date of the consent text (`CONTENT_PAGES.acikRiza.updated`) the member agreed to.
    { name: 'digestConsentVersion', type: 'text', maxLength: 40 },
    // Where and when the consent behind "on" was asked for: the account's settings (asked and
    // confirmed at `digestChangedAt`), or the newsletter page (asked when its form was sent,
    // confirmed with the emailed link at `digestChangedAt`). Set while Glia Notes is on, empty
    // while it is off (database constraints). The sync writes the consent records under a new
    // subscriber from these, so they say where and when the person agreed (M2, D50).
    {
      name: 'digestConsentSource',
      type: 'select',
      options: [
        { value: 'account', label: 'Account settings' },
        { value: 'newsletter-form', label: 'Newsletter page' },
      ],
    },
    { name: 'digestRequestedAt', type: 'date' },
    // Set when an address is proven for the member (a new account with an address, a verified
    // change, Google's address added): the sync asks listmonk once whether that address already
    // has Glia Notes through the newsletter page, and if so the account holds that subscription
    // (src/lib/newsletter/members.ts). Empty again once asked.
    { name: 'digestAdoptCheckAt', type: 'date' },
    // When listmonk last received the choice. Empty again after a change of the choice or of the
    // address (both wait for the sync then), or when the daily check finds the subscriber gone or
    // under another address.
    { name: 'digestSyncedAt', type: 'date' },
    // listmonk's subscriber that holds the member's Glia Notes: its ID and UUID, both or neither
    // (database constraints, 20261002_210000_members_sync_constraints). The sync finds the
    // subscriber by it after an address change, and the erasure after an account deletion.
    { name: 'digestSubscriberId', type: 'number', index: true },
    { name: 'digestSubscriberUuid', type: 'text' },
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
