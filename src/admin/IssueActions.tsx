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

  async function post(action: 'test' | 'push', request: Record<string, string> = {}) {
    setBusy(true)
    setAnswer(null)
    try {
      const response = await fetch(`${base}/${action}/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const answer = (await response.json().catch(() => null)) as Answer | null
      setAnswer(answer ?? { ok: false, message: `The site answered ${response.status}.` })
      router.refresh()
    } catch {
      setAnswer({ ok: false, message: 'The site could not be reached. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const month = typeof data?.month === 'string' ? data.month : null
  const status = typeof data?.status === 'string' ? data.status : 'draft'
  const sendAt = typeof data?.sendAt === 'string' ? new Date(data.sendAt) : null
  const locked = ['sending', 'paused', 'sent'].includes(status)

  function schedule() {
    const when = sendAt
      ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short' }).format(sendAt)
      : 'its date'
    // An explicit second step: scheduling sends the issue to every subscriber at its date. A
    // cancelled campaign was cancelled while sending, so part of it may have gone out already.
    const resend =
      status === 'cancelled'
        ? ' Its earlier campaign was cancelled while it was sending: some subscribers may have it already, and they get it again.'
        : ''
    if (
      window.confirm(
        `Schedule this issue in listmonk? It goes to every subscriber of Glia Notes on ${when} (your computer's time).${resend}`,
      )
    ) {
      void post('push', { mode: 'schedule' })
    }
  }
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
      <h4 className="issue-actions__title">listmonk</h4>
      {locked ? (
        <p className="issue-actions__hint">
          listmonk is sending this issue or has sent it: it can no longer change.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="btn btn--style-secondary btn--size-small"
            disabled={busy}
            onClick={() => void post('push', { mode: 'draft' })}
          >
            {status === 'scheduled'
              ? 'Unschedule (back to a draft)'
              : 'Push to listmonk as a draft'}
          </button>
          <button
            type="button"
            className="btn btn--style-primary btn--size-small"
            disabled={busy || modified}
            onClick={schedule}
          >
            {status === 'scheduled' ? 'Schedule again' : 'Schedule in listmonk'}
          </button>
          <p className="issue-actions__hint">
            A draft sends nothing. Scheduling sends the issue at its date, after you confirm. Each
            push sends the saved issue as it is now. Off until the launch (D53).
          </p>
        </>
      )}
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
