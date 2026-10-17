import type { Access, FieldAccess } from 'payload'

// Who may do what through Payload's API: the REST routes under /api, which the admin uses (PLAN
// §18.2). Signed-out requests get nothing there: what is public is drawn by the site's pages,
// which read through Payload's local API with their own queries (open jobs only, for example),
// and the public forms write through it.
//
// Every collection and global states its rule for each operation. Payload's default for an
// operation that is not set is "signed in", but a function replaces that default, so each rule
// checks req.user itself: in M4.1 a delete rule that returned a query without looking at the user
// let anyone delete a manually added institution. tests/e2e/access.spec.ts sends signed-out
// requests to every collection and global over HTTP; a rule that is deliberately open needs a
// comment where it is set and an entry in that test's table.

/**
 * Signed-in editors: Payload's own default, stated. The admin's editors are the only accounts
 * Payload signs in (members, M4b, get their own sign-in and tables, PLAN §18.2).
 */
export const signedIn: Access = ({ req }) => Boolean(req.user)

/**
 * The same for a field (Payload's field rules take other arguments): a field that only editors may
 * read and write, such as a subfield's AI draft of its introduction (D53).
 */
export const signedInField: FieldAccess = ({ req }) => Boolean(req.user)

/** Nobody through the API or the admin: only the site's own code, through the local API. */
export const nobody: Access = () => false
