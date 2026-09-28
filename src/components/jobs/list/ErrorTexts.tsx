'use client'

import { type ReactNode, createContext, useContext } from 'react'

// The words of the jobs list's error state. An error boundary is a client component and gets no
// props from the server, so the list's layout hands it these through context; the site loads no
// message catalogue in the browser (PLAN §17.3).

export type ErrorTexts = { title: string; text: string; retry: string; reference: string }

const ErrorTextsContext = createContext<ErrorTexts | null>(null)

export function ErrorTextsProvider({
  texts,
  children,
}: {
  texts: ErrorTexts
  children: ReactNode
}) {
  return <ErrorTextsContext value={texts}>{children}</ErrorTextsContext>
}

export const useErrorTexts = () => useContext(ErrorTextsContext)
