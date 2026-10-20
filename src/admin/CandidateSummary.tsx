'use client'

import { useFormFields } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

import {
  type Group,
  type Labels,
  aiDraft,
  monitorFacts,
  suggestedTags,
  termKeys,
} from './candidate-summary'

// On a candidate's page in the admin (D57): its machine data in plain words, above the same data
// as JSON (folded, for the technical administrator), and, once it is accepted, a button to its
// draft job. The words are built in candidate-summary.ts; the terms' labels are read once from the
// admin's own API (editors may read the taxonomy).

type Term = { slug: string; vocabulary: string; label: string }

/** The labels of the terms named, by `vocabulary:slug`; empty until they arrive. */
function useTermLabels(keys: string[]): Map<string, string> {
  const [labels, setLabels] = useState(new Map<string, string>())
  const wanted = keys.join(',')
  useEffect(() => {
    if (!wanted) return
    const slugs = [...new Set(wanted.split(',').map((key) => key.slice(key.indexOf(':') + 1)))]
    const params = new URLSearchParams({
      depth: '0',
      limit: '200',
      locale: 'en',
      'where[slug][in]': slugs.join(','),
    })
    let current = true
    fetch(`/api/terms?${params}`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { docs?: Term[] } | null) => {
        if (!current || !body?.docs) return
        setLabels(new Map(body.docs.map((term) => [`${term.vocabulary}:${term.slug}`, term.label])))
      })
      // Without labels the panel shows the slugs, which the JSON below shows too.
      .catch(() => {})
    return () => {
      current = false
    }
  }, [wanted])
  return labels
}

function GroupView({ group }: { group: Group }) {
  return (
    <section className="candidate-summary__group">
      <h4 className="candidate-summary__title">{group.title}</h4>
      <dl className="candidate-summary__rows">
        {group.rows.map((row) => (
          <div key={row.label} className="candidate-summary__row">
            <dt>{row.label}</dt>
            <dd>
              {row.value}
              {row.from && <span className="candidate-summary__from">From: {row.from}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function CandidateSummary() {
  const extracted = useFormFields(([fields]) => fields.extracted?.value)
  const tags = useFormFields(([fields]) => fields.tagSuggestions?.value)
  const draft = useFormFields(([fields]) => fields.aiSuggestion?.value)
  const keys = useMemo(() => termKeys(tags, draft), [tags, draft])
  const known = useTermLabels(keys)
  const labels: Labels = (vocabulary, slug) => known.get(`${vocabulary}:${slug}`) ?? slug

  const groups = [monitorFacts(extracted), aiDraft(draft, labels), suggestedTags(tags, labels)]
  const shown = groups.filter((group): group is Group => group !== null)
  if (shown.length === 0) return null
  return (
    <div className="candidate-summary">
      <h3 className="candidate-summary__heading">In plain words</h3>
      <p className="candidate-summary__hint">
        Starting points only: check every fact on the original posting.
      </p>
      {shown.map((group) => (
        <GroupView key={group.title} group={group} />
      ))}
    </div>
  )
}

/** The job a relationship field holds: its ID, as the form keeps it. */
function jobId(value: unknown): string | null {
  if (typeof value === 'number' || typeof value === 'string') return String(value)
  if (value && typeof value === 'object' && 'value' in value) return jobId(value.value)
  if (value && typeof value === 'object' && 'id' in value) return jobId(value.id)
  return null
}

/** In the sidebar, under "Job created": the way on to the draft job once there is one. */
export function CandidateJobLink() {
  const id = jobId(useFormFields(([fields]) => fields.publishedRef?.value))
  if (!id) return null
  return (
    <div className="candidate-job-link">
      <a className="btn btn--style-primary btn--size-medium" href={`/admin/collections/jobs/${id}`}>
        Open the draft job
      </a>
      <p className="candidate-job-link__hint">
        Add the facts there, tick the checklist and publish.
      </p>
    </div>
  )
}
