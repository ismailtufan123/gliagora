// What the jobs list's script (JobsListEnhancer) keeps of the reader's first actions until its
// behaviour (ListBehaviour) has arrived, which then does them in order.

export type Waiting = {
  /** A changed field, a submitted form, typing in a list's search box or a clicked chip. */
  event: Event
  /** Whether an arrow key was down when it happened (arrow keys only move a radio choice). */
  arrowKey: boolean
}

/**
 * Called by ListBehaviour once its own listeners answer: from then on JobsListEnhancer keeps
 * nothing, and what it kept so far is returned, oldest first.
 */
export type TakeOver = () => Waiting[]

/** A click that follows a link in this tab (not a middle click or one with a modifier key). */
export const plainClick = (event: MouseEvent) =>
  !event.button && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
