// The newsletter part of deleting someone's data (M4b, D49; the M4b design §7.6, §7.8): "Delete my
// account" calls it now, and a confirmed deletion request will. At M2, when Glia Notes runs on
// listmonk (PLAN §13), it removes the subscriber with that address there, with the consent records
// (`ConsentLog`). Until then nobody is subscribed anywhere: a member's Glia Notes choice is stored
// on the member, which goes with the account, and the newsletter signup does not exist yet. So it
// does nothing; the callers already call it where M2 needs it.

/** Removes the newsletter subscription of `email`. Returns how many subscribers it removed. */
export async function eraseNewsletter(_email: string | null): Promise<number> {
  return 0
}
