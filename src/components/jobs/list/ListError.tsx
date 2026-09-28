import type { ReactNode } from 'react'

// The jobs list's error state (PLAN §7.5 "States"): what happened, the reference that finds the
// error in the server's log, and a way to try again. The page draws it on the server when the
// list cannot be read, so it shows without JavaScript; error.tsx draws it for anything else that
// fails while a change loads in the browser.
export function ListError({
  title,
  text,
  reference,
  retry,
}: {
  title: string
  text: string
  /** "Reference: …", when there is one. */
  reference?: string
  retry: ReactNode
}) {
  return (
    <main id="main" className="page-frame flex-1 py-12">
      <div className="prose" role="alert">
        <h1>{title}</h1>
        <p>{text}</p>
        {reference && <p className="text-caption text-text-muted">{reference}</p>}
        <p>{retry}</p>
      </div>
    </main>
  )
}
