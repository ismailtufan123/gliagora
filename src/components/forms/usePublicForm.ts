'use client'

import { type FormEvent, useActionState, useEffect, useRef, useState } from 'react'

import type { FormState } from '@/lib/forms/public-form'

import { solveChallenge } from './solve'

// The browser's part of a public form ("Suggest a listing", "Report a problem"; PLAN §18.2).
// Every check and message comes from the server (the Server Action returns the next state), so
// the forms work the same without JavaScript, apart from the spam check. This adds only what
// needs the browser: the spam check (solve.ts, started when the form is first used), the busy
// state and moving focus to the error summary after a failed send. `permalink` is where a send
// without JavaScript (or before it has loaded) goes instead of the page's current address, for a
// page whose address can carry what should not come back with the form's answer (the sign-in
// page's outcome message); React finds the form's answer there by it, so the page must render the
// same permalink at that address.

export type FormAction<Values> = (
  state: FormState<Values>,
  form: FormData,
) => Promise<FormState<Values>>

export function usePublicForm<Values>(
  action: FormAction<Values>,
  initial: FormState<Values>,
  permalink?: string,
) {
  const [state, formAction, pending] = useActionState(action, initial, permalink)
  const [waiting, setWaiting] = useState(false)
  const answer = useRef<HTMLInputElement>(null)
  const summary = useRef<HTMLDivElement>(null)
  const challenge = useRef(state.challenge)
  const solving = useRef<Promise<void> | null>(null)
  const solved = useRef(false)
  const queued = useRef(false)

  // Solves the current challenge once; an answer to an older one is dropped.
  const start = () => {
    const spam = challenge.current
    if (!spam) return Promise.resolve()
    solving.current ??= solveChallenge(spam).then((payload) => {
      if (spam !== challenge.current) return
      if (answer.current) answer.current.value = payload ?? ''
      solved.current = true
    })
    return solving.current
  }
  // Each state brings a new challenge. After a failed send the person is about to send again, so
  // start at once; the first challenge waits until the form is used.
  useEffect(() => {
    challenge.current = state.challenge
    solving.current = null
    solved.current = false
    if (answer.current) answer.current.value = ''
    if (state.attempt > 0) {
      summary.current?.focus()
      void start()
    }
  }, [state])

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (pending) return event.preventDefault()
    if (solved.current || !state.challenge) return
    // Not solved yet: send as soon as it is.
    event.preventDefault()
    if (queued.current) return
    queued.current = true
    setWaiting(true)
    const form = event.currentTarget
    void start().then(() => {
      queued.current = false
      setWaiting(false)
      form.requestSubmit()
    })
  }

  return {
    state,
    formAction,
    busy: pending || waiting,
    /** The hidden input that carries the spam check's answer. */
    answer,
    /** The error summary, focused after a failed send. */
    summary,
    onSubmit,
    onFocus: () => void start(),
  }
}
