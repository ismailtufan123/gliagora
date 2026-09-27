// The shared tag system (PLAN §4): one set of vocabularies for every content type.

/** Vocabularies in the order of PLAN §4.2–4.7, with the names editors see in the admin. */
export const VOCABULARIES = [
  { value: 'subfield', label: 'Subfield' },
  { value: 'method', label: 'Method' },
  { value: 'model-system', label: 'Model system' },
  { value: 'position-type', label: 'Position type' },
  { value: 'career-stage', label: 'Career stage' },
  { value: 'event-type', label: 'Event type' },
  { value: 'event-format', label: 'Event format' },
  { value: 'deadline-type', label: 'Deadline type' },
  { value: 'funding-type', label: 'Funding type' },
  { value: 'resource-type', label: 'Resource type' },
  { value: 'evidence-level', label: 'Evidence level' },
  { value: 'disease-area', label: 'Disease area' },
] as const

export type Vocabulary = (typeof VOCABULARIES)[number]['value']

/** Groups of the method vocabulary (PLAN §4.3), used to arrange the method filter. */
export const METHOD_GROUPS = [
  { value: 'recording-imaging', label: 'Recording and imaging' },
  { value: 'manipulation', label: 'Manipulation' },
  { value: 'molecular', label: 'Molecular' },
  { value: 'behaviour-clinical', label: 'Behaviour and clinical' },
  { value: 'computational', label: 'Computational' },
  { value: 'engineering', label: 'Engineering' },
] as const

export type MethodGroup = (typeof METHOD_GROUPS)[number]['value']

/** Lowercase words joined by single hyphens (PLAN §2.1), e.g. `systems-circuits`. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}

/** MeSH descriptor IDs (e.g. `D009457`) and OpenAlex topic IDs (e.g. `T10581`), used from M10. */
export const MESH_ID_PATTERN = /^D\d{6,9}$/
export const OPENALEX_TOPIC_PATTERN = /^T\d+$/

type TermNode<Id> = { id: Id; parent?: Id | null }

/**
 * The selected terms plus all their descendants: filters match parents inclusively, so
 * `rodent` also finds items tagged `mouse` or `rat` (PLAN §4.1).
 */
export function withDescendants<Id>(selected: readonly Id[], terms: readonly TermNode<Id>[]): Id[] {
  const children = new Map<Id, Id[]>()
  for (const term of terms) {
    if (term.parent == null) continue
    children.set(term.parent, [...(children.get(term.parent) ?? []), term.id])
  }
  const result = new Set<Id>()
  const queue = [...selected]
  while (queue.length > 0) {
    const id = queue.shift() as Id
    if (result.has(id)) continue
    result.add(id)
    queue.push(...(children.get(id) ?? []))
  }
  return [...result]
}

/**
 * Whether giving term `id` the parent `parent` would create a loop, following the existing
 * parent links (`parentOf`, which may look them up in the database). A term cannot be its own
 * ancestor.
 */
export async function createsCycle<Id>(
  id: Id,
  parent: Id,
  parentOf: (id: Id) => Promise<Id | null | undefined> | Id | null | undefined,
): Promise<boolean> {
  const seen = new Set<Id>()
  let current: Id | null | undefined = parent
  while (current != null) {
    if (current === id || seen.has(current)) return true
    seen.add(current)
    current = await parentOf(current)
  }
  return false
}
