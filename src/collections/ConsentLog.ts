import type { CollectionConfig } from 'payload'

import { HIDDEN_RECORDS } from './hidden'

/** What a consent record says happened. */
export const CONSENT_EVENTS = ['requested', 'confirmed', 'unsubscribed'] as const
export type ConsentEvent = (typeof CONSENT_EVENTS)[number]

/**
 * Where it happened: the newsletter form (/en/newsletter/), a member's settings (the sync), the
 * unsubscribe page's button, a mail program's one-click unsubscribe (RFC 8058), or listmonk (an
 * unsubscribe the site noted because listmonk no longer has the subscriber: a restore of
 * listmonk's database lost it, or it was deleted there).
 */
export const CONSENT_SOURCES = [
  'newsletter-form',
  'account',
  'unsubscribe-link',
  'one-click',
  'listmonk',
] as const
export type ConsentSource = (typeof CONSENT_SOURCES)[number]

// The record of consent to Glia Notes (M2, D50; PLAN §5.1, §13, §18.1; the açık rıza metni's
// "Açık rıza kaydı"): who asked to subscribe (`requested`, at the time the form was sent), confirmed
// it (`confirmed`, when the emailed link was used) or unsubscribed, by listmonk's subscriber UUID
// and ID, with the version of the consent text agreed to (its date, GLIA_NOTES_CONSENT_VERSION) and
// the form it came from. A subscription that ends without the site's unsubscribe (listmonk no
// longer has the subscriber, which `applyDeletionLog` checks by its ID every 10 minutes) gets an
// `unsubscribed` record with the source `listmonk`, so its records do not outlive their 3 years.
// Never an email address: the address lives in listmonk only, and only once it is confirmed. No
// relation to members: deleting an account for inactivity leaves the record as it is, while an
// erasure (an account deleted on purpose, a confirmed deletion request; src/lib/newsletter/erase.ts)
// unlinks the records of the subscribers it deletes, clearing the UUID and the ID together, and logs
// each (`deletion-log`, `consent-log`/`unlink`).
//
// Written only in SQL by src/lib/newsletter/store.ts, inside the transaction of what it records;
// hidden like the member collections (`nobody`, no API routes, no versions). Its rules are database
// constraints (migration 20261002_190000_newsletter_constraints). Kept 3 years after the
// subscription ended (its newest row, an unsubscribe), a row without a subscriber 3 years after its
// own time (CONSENT_LOG_YEARS, `purgeRetention`). A restore carries it over, as the deletion log
// (deploy/backup/restore.sh): consent is evidence.
export const ConsentLog: CollectionConfig = {
  slug: 'consent-log',
  labels: { singular: 'Consent record', plural: 'Consent log' },
  ...HIDDEN_RECORDS,
  indexes: [{ fields: ['subscriberUuid', 'at'] }],
  fields: [
    // listmonk's subscriber UUID; empty once unlinked (an erasure, src/lib/newsletter/erase.ts).
    { name: 'subscriberUuid', type: 'text' },
    // listmonk's subscriber ID, with the UUID (empty with it): how the site asks listmonk whether
    // the subscriber still exists (`GET /api/subscribers/:id`).
    { name: 'subscriberId', type: 'number' },
    {
      name: 'event',
      type: 'select',
      required: true,
      options: CONSENT_EVENTS.map((value) => ({ value, label: value })),
    },
    // The date of the consent text agreed to; for `requested` and `confirmed` only.
    { name: 'consentVersion', type: 'text', maxLength: 40 },
    {
      name: 'source',
      type: 'select',
      required: true,
      options: CONSENT_SOURCES.map((value) => ({ value, label: value })),
    },
    { name: 'at', type: 'date', required: true, index: true },
  ],
}
