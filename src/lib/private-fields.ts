import type { CollectionBeforeOperationHook, SelectType } from 'payload'

/**
 * A hook that keeps personal data, such as an email address, out of the admin list (PLAN §18.1):
 * it drops the given top-level fields from every access-checked read that asks for specific
 * fields. Give the fields `admin.disableListColumn` as well, so the list offers no column for them.
 *
 * Payload 3.90's list view loads only its columns (`enableListViewSelectAPI`), but it takes them
 * from `?columns=` or the editor's saved preference without checking `disableListColumn`, so one
 * crafted link would otherwise make every later list load send these fields to the browser.
 *
 * - The document view asks for no fields, so an editor still sees them by opening a record.
 * - Code on the server keeps what it asks for: the local API bypasses access control by default.
 * - A field left out on purpose (`false`, Payload's exclude mode) stays left out. If nothing that
 *   was asked for is left, the read returns only the IDs.
 */
export function keepOutOfLists(fields: readonly string[]): CollectionBeforeOperationHook {
  return ({ args, operation, overrideAccess }) => {
    if (operation !== 'read' || overrideAccess || !args.select) return args
    const select: SelectType = { ...args.select }
    for (const field of fields) {
      if (select[field]) delete select[field]
    }
    return { ...args, select }
  }
}
