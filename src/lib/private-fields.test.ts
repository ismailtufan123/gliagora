import { describe, expect, it } from 'vitest'

import { keepOutOfLists } from './private-fields'

const hook = keepOutOfLists(['email', 'details'])
const run = (operation: string, args: Record<string, unknown>, overrideAccess?: boolean) =>
  hook({ args, operation, overrideAccess, req: {} } as never) as Record<string, unknown>

describe('keepOutOfLists', () => {
  it('drops the fields from an access-checked read that asks for them, as the admin list does', () => {
    // /admin/collections/reports/?columns=["email","details","kind"], or a saved preference.
    const args = { select: { kind: true, email: true, details: true }, where: {} }
    expect(run('read', args, false)).toEqual({ select: { kind: true }, where: {} })
    // The caller's arguments are left as they were.
    expect(args.select).toEqual({ kind: true, email: true, details: true })
  })

  it('returns only the IDs when nothing that was asked for is left', () => {
    expect(run('read', { select: { email: true } }, false)).toEqual({ select: {} })
  })

  it('leaves a read that asks for no fields alone, as the document view does', () => {
    const args = { id: 1 }
    expect(run('read', args, false)).toBe(args)
  })

  it('leaves server code alone, which bypasses access control', () => {
    const args = { select: { email: true, kind: true } }
    expect(run('read', args, true)).toBe(args)
  })

  it('keeps a field that was left out on purpose left out', () => {
    expect(run('read', { select: { email: false, details: false } }, false)).toEqual({
      select: { email: false, details: false },
    })
  })

  it('changes nothing but reads', () => {
    const args = { select: { email: true } }
    for (const operation of ['count', 'create', 'update', 'delete']) {
      expect(run(operation, args, false), operation).toBe(args)
    }
  })
})
