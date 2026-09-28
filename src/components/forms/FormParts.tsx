'use client'

import { type MouseEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'

import { FORM_INPUTS } from '@/lib/forms/fields'

// Parts shared by the public forms ("Suggest a listing", "Report a problem"; PLAN §7.5, §18.2):
// the error summary, a field's message, a text area with its character count, the fields of the
// spam check and the send button. All text comes from messages, through the props.

/** Joins the IDs that describe a control, leaving out the missing ones. */
export const describedBy = (...list: (string | false | undefined)[]) =>
  list.filter(Boolean).join(' ') || undefined

/** A problem with one field, as the error summary links to it. */
export type SummaryItem = { target: string; message: string }

/**
 * At the top of a form that was sent with problems. Focus moves here after a failed send: by
 * usePublicForm, and without JavaScript by `autofocus` in the HTML the server sends back (WCAG
 * 3.3.1). Render it with `key={state.attempt}`: a new element for each attempt, so screen readers
 * announce it again.
 */
export function ErrorSummary({
  id,
  title,
  formError,
  items,
  summaryRef,
}: {
  id: string
  title: string
  formError: string | null
  items: SummaryItem[]
  summaryRef: RefObject<HTMLDivElement | null>
}) {
  if (!formError && items.length === 0) return null
  // Links in the summary move focus to the field, not only the view.
  const jump = (event: MouseEvent<HTMLAnchorElement>, target: string) => {
    const field = document.getElementById(target)
    if (!field) return
    event.preventDefault()
    field.focus()
  }
  return (
    <div
      ref={summaryRef}
      className="error-summary"
      role="alert"
      aria-labelledby={`${id}-errors`}
      tabIndex={-1}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
    >
      <h2 id={`${id}-errors`} className="text-card">
        {title}
      </h2>
      <ul role="list">
        {formError && <li>{formError}</li>}
        {items.map(({ target, message }) => (
          <li key={target}>
            <a href={`#${target}`} onClick={(event) => jump(event, target)}>
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A field's message, which the field's `aria-describedby` names. */
export function FieldError({
  id,
  prefix,
  message,
}: {
  id: string
  prefix: string
  message: string | undefined
}) {
  if (!message) return null
  return (
    <p id={id} className="field-error">
      <span className="sr-only">{prefix}</span> {message}
    </p>
  )
}

/** The count is read out only this close to the limit, after typing pauses. */
const ANNOUNCE_WITHIN = 50

/**
 * A text area with the characters left below it. The count is in the server's HTML too, so the
 * line is there before the scripts run and nothing below it moves (line breaks counted as one
 * character, like the browser does). `version` changes with each state the server returns, when
 * the form is reset to the text sent.
 */
export function CountedTextarea({
  id,
  name,
  max,
  rows,
  defaultValue,
  version,
  left,
  over,
  invalid,
  describedBy: description,
}: {
  id: string
  name: string
  max: number
  rows: number
  defaultValue: string
  version: number
  /** "Characters left: {count}" ("{count}" only, no plural forms). */
  left: string
  /** "Characters over the limit: {count}". */
  over: string
  invalid: boolean
  describedBy: string | undefined
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [count, setCount] = useState(() => defaultValue.replace(/\r\n?/g, '\n').length)
  const [spoken, setSpoken] = useState('')
  useEffect(() => {
    setCount(area.current?.value.length ?? 0)
  }, [version])

  const countText = (length: number) =>
    length <= max
      ? left.replace('{count}', String(max - length))
      : over.replace('{count}', String(length - max))
  const onInput = () => {
    const length = area.current?.value.length ?? 0
    setCount(length)
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () => setSpoken(max - length <= ANNOUNCE_WITHIN ? countText(length) : ''),
      1000,
    )
  }

  return (
    <>
      <textarea
        ref={area}
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        onInput={onInput}
        aria-invalid={invalid || undefined}
        aria-describedby={description}
        className="input"
      />
      <p aria-hidden="true" className={count > max ? 'field-error' : 'field-hint'}>
        {countText(count)}
      </p>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
    </>
  )
}

/**
 * The hidden field for spam programs, which people and assistive technology never see, and the
 * input that carries the spam check's answer.
 */
export function SpamFields({
  id,
  honeypot,
  answerRef,
}: {
  id: string
  honeypot: string
  answerRef: RefObject<HTMLInputElement | null>
}) {
  return (
    <>
      <div className="sr-only" aria-hidden="true">
        <label htmlFor={`${id}-reference`}>{honeypot}</label>
        <input
          id={`${id}-reference`}
          name={FORM_INPUTS.honeypot}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input ref={answerRef} type="hidden" name={FORM_INPUTS.altcha} />
    </>
  )
}

/** The note on the spam check and the send button, which says when the form is being sent. */
export function SendRow({
  note,
  busy,
  submit,
  sending,
}: {
  note: ReactNode
  busy: boolean
  submit: string
  sending: string
}) {
  return (
    <div className="grid justify-items-start gap-4">
      <p className="field-hint">{note}</p>
      <button type="submit" className="button button-primary">
        {busy ? sending : submit}
      </button>
      <p className="sr-only" role="status">
        {busy ? sending : ''}
      </p>
    </div>
  )
}
