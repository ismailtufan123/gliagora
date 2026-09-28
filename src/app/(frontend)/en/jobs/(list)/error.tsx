'use client'

import { useErrorTexts } from '@/components/jobs/list/ErrorTexts'
import { ListError } from '@/components/jobs/list/ListError'

// When a change of the jobs list fails in the browser (PLAN §7.5 "States"): what happened, a way
// to try again, and the reference that finds the error in the server's log. A list that cannot be
// read when the page is requested shows the same state from the server (page.tsx), because an
// error boundary is drawn only with JavaScript.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const texts = useErrorTexts()
  if (!texts) return null
  return (
    <ListError
      title={texts.title}
      text={texts.text}
      reference={error.digest && texts.reference.replace('{digest}', error.digest)}
      retry={
        <button type="button" className="button button-primary" onClick={() => retry()}>
          {texts.retry}
        </button>
      }
    />
  )
}
