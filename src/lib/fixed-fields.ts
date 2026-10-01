import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionSlug,
} from 'payload'
import { ValidationError } from 'payload'

/**
 * Hooks for fields that are fixed once a document is saved, such as a term's slug (PLAN §4.1).
 * Give the fields `access: { update: () => false }` as well, so the admin shows them read-only.
 *
 * - On update, a fixed field that is missing from the data is filled in from the saved document.
 *   Payload leaves such fields out when it restores a version from the admin, which otherwise
 *   fails validation.
 * - A change to a fixed field is refused, also from code that bypasses access control.
 * - With `untilSet`, a field that is still empty (null or missing) may be filled in once, by the
 *   site's own code: what a data request says is stored only when the person confirms it.
 */
export function fixedFieldHooks(
  collection: CollectionSlug,
  fields: readonly string[],
  { untilSet = false }: { untilSet?: boolean } = {},
) {
  const restore: CollectionBeforeValidateHook = ({ data, operation, originalDoc }) => {
    if (operation !== 'update' || !originalDoc || !data) return data
    for (const field of fields) {
      if (data[field] === undefined) data[field] = originalDoc[field]
    }
    return data
  }

  const guard: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
    if (operation !== 'update' || !originalDoc) return data
    const changed = fields.filter(
      (field) =>
        field in data &&
        data[field] !== originalDoc[field] &&
        !(untilSet && originalDoc[field] == null),
    )
    if (changed.length > 0) {
      throw new ValidationError({
        collection,
        errors: changed.map((path) => ({ path, message: 'This cannot be changed after saving.' })),
        req,
      })
    }
    return data
  }

  return { beforeValidate: [restore], beforeChange: [guard] }
}
