import { readFileSync } from 'node:fs'

import type { Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { NewsletterIssues } from './NewsletterIssues'

const field = (name: string) =>
  NewsletterIssues.fields.find((f): f is Field & { name: string } => 'name' in f && f.name === name)

type Rule = (args: unknown) => unknown
const signedIn = { req: { user: { id: 1 } } }
const signedOut = { req: { user: null } }

describe('Glia Notes issues (M11, D53)', () => {
  it('are for signed-in editors; only an issue that never reached listmonk can be deleted', () => {
    const access = NewsletterIssues.access as Record<string, Rule>
    for (const operation of ['read', 'create', 'update']) {
      expect(access[operation]!(signedIn), operation).toBe(true)
      expect(access[operation]!(signedOut), operation).toBe(false)
    }
    expect(access.delete!(signedIn)).toEqual({ listmonkCampaignId: { exists: false } })
    expect(access.delete!(signedOut)).toBe(false)
  })

  it("lock the editor's fields while listmonk has the campaign scheduled, sending or sent", () => {
    for (const name of ['sendAt', 'subject', 'preheader', 'intro', 'selected', 'proposeAgain']) {
      const update = (field(name) as { access: { update: Rule } }).access.update
      expect(update({ ...signedIn, doc: { status: 'draft' } }), name).toBe(true)
      expect(update({ ...signedIn, doc: { status: 'pushed' } }), name).toBe(true)
      expect(update({ ...signedIn, doc: { status: 'cancelled' } }), name).toBe(true)
      for (const status of ['scheduled', 'sending', 'paused', 'sent']) {
        expect(update({ ...signedIn, doc: { status } }), `${name} ${status}`).toBe(false)
      }
      expect(update({ ...signedOut, doc: { status: 'draft' } }), name).toBe(false)
    }
  })

  it('leave the status, the campaign, the dates and the snapshot to the site', () => {
    for (const name of [
      'month',
      'status',
      'listmonkCampaignId',
      'pushedAt',
      'sentAt',
      'snapshot',
    ]) {
      const access = (field(name) as { access: Record<string, Rule> }).access
      expect(access.create!(signedIn), name).toBe(false)
      expect(access.update!(signedIn), name).toBe(false)
    }
  })

  it('take their month from their date, and hold at most 15 selected positions', () => {
    const [setMonth] = NewsletterIssues.hooks?.beforeValidate ?? []
    const data = (setMonth as Rule)({ data: { sendAt: '2026-11-03T13:00:00.000Z' } })
    expect(data).toMatchObject({ month: '2026-11' })
    expect(field('month')).toMatchObject({ unique: true })
    expect(field('selected')).toMatchObject({ relationTo: 'jobs', hasMany: true, maxRows: 15 })
  })

  it('save with a selected position that has closed since: only the number is checked', () => {
    // Payload's own check would apply the picker's filter (published jobs) on every save, so an
    // issue could no longer be saved once a selected job expired.
    const validate = (field('selected') as { validate: Rule }).validate
    expect(validate([1, 2, 3])).toBe(true)
    expect(validate(null)).toBe(true)
    expect(validate(Array.from({ length: 16 }, (_, i) => i + 1))).toBe(
      'Choose at most 15 positions.',
    )
  })

  it('show their actions from a component in the committed import map', () => {
    const actions = NewsletterIssues.fields.find(
      (f) => 'name' in f && f.name === 'actions',
    ) as unknown as { admin: { components: { Field: string } } }
    const importMap = readFileSync(
      new URL('../app/(payload)/admin/importMap.js', import.meta.url),
      'utf8',
    )
    expect(importMap).toContain(`"${actions.admin.components.Field}"`)
  })

  it('offer a preview, a test send and the push, and nothing else, as routes', () => {
    expect(NewsletterIssues.endpoints).not.toBe(false)
    const routes = (NewsletterIssues.endpoints || []).map(({ method, path }) => `${method} ${path}`)
    expect(routes).toEqual(['get /:id/preview', 'post /:id/test', 'post /:id/push'])
  })
})
