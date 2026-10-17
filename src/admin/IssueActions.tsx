'use client'

import { useDocumentInfo, useFormModified } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

// The actions of a Glia Notes issue, in the sidebar of its page in the admin (M11, D53): the
// preview (HTML and plain text, in a new tab), a test email to the editor and the seed addresses,
// and, once pushing is switched on (GLIA_NOTES_PUSH, at the launch), the push to listmonk. Each
// works on the saved issue, so unsaved changes are named first. The routes are in
// src/lib/newsletter/issue/endpoints.ts; their answers are plain messages.

type Answer = { ok: boolean; message: string }

export function IssueActions() {
  const { id, data } = useDocumentInfo()
  const modified = useFormModified()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)

  if (!id) {
    return (
      <div className="issue-actions">
        <h3 className="issue-actions__title">Preview and send</h3>
        <p>Save the issue first: then you can preview it and send a test.</p>
      </div>
    )
  }

  const base = `/api/newsletter-issues/${encodeURIComponent(String(id))}`

  async function post(action: 'test') {
    setBusy(true)
    setAnswer(null)
    try {
      const response = await fetch(`${base}/${action}/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const body = (await response.json().catch(() => null)) as Answer | null
      setAnswer(body ?? { ok: false, message: `The site answered ${response.status}.` })
      router.refresh()
    } catch {
      setAnswer({ ok: false, message: 'The site could not be reached. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const month = typeof data?.month === 'string' ? data.month : null
  return (
    <div className="issue-actions">
      <h3 className="issue-actions__title">Preview and send</h3>
      {modified && (
        <p className="issue-actions__warning">
          You have unsaved changes. Save first: the preview and the test show the saved issue.
        </p>
      )}
      <ul className="issue-actions__list">
        <li>
          <a href={`${base}/preview/`} target="_blank" rel="noopener noreferrer">
            Preview the email
          </a>
        </li>
        <li>
          <a href={`${base}/preview/?format=text`} target="_blank" rel="noopener noreferrer">
            Preview the plain text
          </a>
        </li>
      </ul>
      <button
        type="button"
        className="btn btn--style-secondary btn--size-small"
        disabled={busy}
        onClick={() => void post('test')}
      >
        Send a test email
      </button>
      <p className="issue-actions__hint">
        To you and the seed addresses (GLIA_NOTES_SEED_ADDRESSES), through the site&apos;s mail
        server. Its unsubscribe links change nothing.
      </p>
      {month && (
        <p className="issue-actions__hint">Archive address once sent: /en/newsletter/{month}/</p>
      )}
      {answer && (
        <p className={answer.ok ? 'issue-actions__ok' : 'issue-actions__error'} role="status">
          {answer.message}
        </p>
      )}
    </div>
  )
}
