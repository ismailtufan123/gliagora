'use client'

import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react'

import { NOTE_MAX, SUGGEST_INPUTS } from '@/lib/forms/fields'
import type { SuggestState } from '@/lib/forms/suggest'

import { solveChallenge } from './solve'

// The "Suggest a listing" form (PLAN §3.2, §7.5, §9.10). Every check and message comes from the
// server (the Server Action returns the next state), so it works the same without JavaScript,
// apart from the spam check. This component adds only what needs the browser: the spam check
// (solve.ts, started when the form is first used), the busy state, updating the note's character
// count and moving focus to the error summary. All text comes from messages, through `text`.

export type SuggestText = {
  errorTitle: string
  errorPrefix: string
  url: { label: string; hint: string }
  kind: { legend: string; options: { value: string; label: string }[] }
  note: { label: string; hint: string; left: string; over: string }
  email: { label: string; hint: string }
  consent: { label: string; hint: ReactNode }
  honeypot: string
  spamNote: ReactNode
  submit: string
  sending: string
}

type Props = {
  action: (state: SuggestState, form: FormData) => Promise<SuggestState>
  initial: SuggestState
  text: SuggestText
}

const ID = 'suggest'
/** Where each field's error summary link leads (the first radio button for the content type). */
const TARGETS = {
  url: `${ID}-url`,
  kind: `${ID}-kind-0`,
  note: `${ID}-note`,
  email: `${ID}-email`,
  consent: `${ID}-consent`,
} as const
type Field = keyof typeof TARGETS

/** The note's count is read out only this close to the limit, after typing pauses. */
const ANNOUNCE_WITHIN = 50

const ids = (...list: (string | false | undefined)[]) => list.filter(Boolean).join(' ') || undefined

export function SuggestForm({ action, initial, text }: Props) {
  const [state, formAction, pending] = useActionState(action, initial)
  const [waiting, setWaiting] = useState(false)
  // In the server's HTML too, so the line is there before the scripts run and nothing below it
  // moves (line breaks counted as one character, like the browser does).
  const [count, setCount] = useState(() => initial.values.note.replace(/\r\n?/g, '\n').length)
  const [spoken, setSpoken] = useState('')
  const answer = useRef<HTMLInputElement>(null)
  const note = useRef<HTMLTextAreaElement>(null)
  const summary = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const challenge = useRef(state.challenge)
  const solving = useRef<Promise<void> | null>(null)
  const solved = useRef(false)
  const queued = useRef(false)
  const { values, fieldErrors: errors } = state

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
    setCount(note.current?.value.length ?? 0)
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

  const countText = (length: number) =>
    length <= NOTE_MAX
      ? text.note.left.replace('{count}', String(NOTE_MAX - length))
      : text.note.over.replace('{count}', String(length - NOTE_MAX))
  const onNoteInput = () => {
    const length = note.current?.value.length ?? 0
    setCount(length)
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () => setSpoken(NOTE_MAX - length <= ANNOUNCE_WITHIN ? countText(length) : ''),
      1000,
    )
  }

  // Links in the error summary move focus to the field, not only the view.
  const jump = (event: MouseEvent<HTMLAnchorElement>, field: Field) => {
    const target = document.getElementById(TARGETS[field])
    if (!target) return
    event.preventDefault()
    target.focus()
  }

  const errorOf = (field: Field) =>
    errors[field] && (
      <p id={`${ID}-${field}-error`} className="field-error">
        <span className="sr-only">{text.errorPrefix}</span> {errors[field]}
      </p>
    )
  const invalid = (field: Field) => (errors[field] ? true : undefined)
  const errorId = (field: Field) => errors[field] && `${ID}-${field}-error`
  const failed = (Object.keys(TARGETS) as Field[]).filter((field) => errors[field])
  const busy = pending || waiting

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      onFocus={() => void start()}
      noValidate
      className="grid gap-8"
    >
      {(state.formError || failed.length > 0) && (
        // Focus moves here after a failed send: by the effect above, and without JavaScript by
        // `autofocus` in the HTML the server sends back (WCAG 3.3.1).
        // A new element for each attempt, so screen readers announce it again.
        <div
          key={state.attempt}
          ref={summary}
          className="error-summary"
          role="alert"
          aria-labelledby={`${ID}-errors`}
          tabIndex={-1}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        >
          <h2 id={`${ID}-errors`} className="text-card">
            {text.errorTitle}
          </h2>
          <ul role="list">
            {state.formError && <li>{state.formError}</li>}
            {failed.map((field) => (
              <li key={field}>
                <a href={`#${TARGETS[field]}`} onClick={(event) => jump(event, field)}>
                  {errors[field]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <input type="hidden" name={SUGGEST_INPUTS.locale} value="en" />

      <div className="field">
        <label htmlFor={TARGETS.url} className="field-label">
          {text.url.label}
        </label>
        <p id={`${ID}-url-hint`} className="field-hint">
          {text.url.hint}
        </p>
        {errorOf('url')}
        <input
          id={TARGETS.url}
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          required
          defaultValue={values.url}
          aria-invalid={invalid('url')}
          aria-describedby={ids(`${ID}-url-hint`, errorId('url'))}
          className="input"
        />
      </div>

      {/* The group is described by its error message, as radio buttons take no aria-invalid. */}
      <fieldset className="field" aria-describedby={ids(errorId('kind'))}>
        <legend className="field-label">{text.kind.legend}</legend>
        {errorOf('kind')}
        <div className="grid gap-2">
          {text.kind.options.map(({ value, label }, index) => (
            <div key={value} className="choice">
              <input
                id={`${ID}-kind-${index}`}
                type="radio"
                name="kind"
                value={value}
                required
                defaultChecked={values.kind === value}
              />
              <label htmlFor={`${ID}-kind-${index}`}>{label}</label>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={TARGETS.note} className="field-label">
          {text.note.label}
        </label>
        <p id={`${ID}-note-hint`} className="field-hint">
          {text.note.hint}
        </p>
        {errorOf('note')}
        <textarea
          ref={note}
          id={TARGETS.note}
          name="note"
          rows={4}
          defaultValue={values.note}
          onInput={onNoteInput}
          aria-invalid={invalid('note')}
          aria-describedby={ids(`${ID}-note-hint`, errorId('note'))}
          className="input"
        />
        <p aria-hidden="true" className={count > NOTE_MAX ? 'field-error' : 'field-hint'}>
          {countText(count)}
        </p>
        <p className="sr-only" aria-live="polite">
          {spoken}
        </p>
      </div>

      <div className="field">
        <label htmlFor={TARGETS.email} className="field-label">
          {text.email.label}
        </label>
        <p id={`${ID}-email-hint`} className="field-hint">
          {text.email.hint}
        </p>
        {errorOf('email')}
        <input
          id={TARGETS.email}
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          defaultValue={values.email}
          aria-invalid={invalid('email')}
          aria-describedby={ids(`${ID}-email-hint`, errorId('email'))}
          className="input"
        />
      </div>

      <div className="field">
        {errorOf('consent')}
        <div className="choice">
          <input
            id={TARGETS.consent}
            name="consent"
            type="checkbox"
            value="yes"
            defaultChecked={values.consent}
            aria-invalid={invalid('consent')}
            aria-describedby={ids(`${ID}-consent-hint`, errorId('consent'))}
          />
          <label htmlFor={TARGETS.consent}>{text.consent.label}</label>
        </div>
        <p id={`${ID}-consent-hint`} className="field-hint choice-hint">
          {text.consent.hint}
        </p>
      </div>

      {/* Spam programs fill in every field; people and assistive technology never see this one. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor={`${ID}-reference`}>{text.honeypot}</label>
        <input
          id={`${ID}-reference`}
          name={SUGGEST_INPUTS.honeypot}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input ref={answer} type="hidden" name={SUGGEST_INPUTS.altcha} />

      <div className="grid justify-items-start gap-4">
        <p className="field-hint">{text.spamNote}</p>
        <button type="submit" className="button button-primary">
          {busy ? text.sending : text.submit}
        </button>
        <p className="sr-only" role="status">
          {busy ? text.sending : ''}
        </p>
      </div>
    </form>
  )
}
