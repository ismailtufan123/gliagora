import type { SourceKind } from './kinds'

// What a monitor read from a posting (D52): the candidate's `extracted` facts, each saying where it
// came from, for the editor to check against the original posting. Only the facts the review needs;
// the posting's text itself, redacted, is the candidate's source text.

/** A fact and where it was found ("the posting's JSON-LD validThrough", "the text: 'Closing date: …'"). */
export type Fact<T> = { value: T; from: string }

export type ExtractedFacts = {
  version: 1
  /** When the monitor read it. */
  readAt: string
  /** The feed, API or list where the posting was listed. */
  listedOn: { kind: SourceKind; url: string }
  /** Whether the posting's own page was read, and if not, why. */
  page: 'read' | 'from-api' | 'robots' | 'pdf' | 'not-html' | 'failed'
  title?: Fact<string>
  /** A fixed deadline: its day, and the time zone the posting names, if any. */
  deadline?: Fact<{ date: string; timeZone: string | null }>
  /** A posting without a fixed day: open until filled, or reviewed on a rolling basis. */
  openEnded?: Fact<'rolling' | 'until-filled'>
  /** The place the posting names. */
  location?: Fact<string>
  /** When the employer published it: a day (YYYY-MM-DD), or as the source gave it (before M7's second round). */
  published?: Fact<string>
  /** No fixed deadline and published long ago: the editor checks first that it is still open. */
  possiblyFilled?: Fact<{ published: string; days: number }>
}

/** The facts stored on a candidate, if they are a monitor's. */
export function storedFacts(value: unknown): ExtractedFacts | null {
  if (!value || typeof value !== 'object') return null
  const facts = value as Partial<ExtractedFacts>
  return facts.version === 1 && typeof facts.readAt === 'string' ? (facts as ExtractedFacts) : null
}
