'use client'

import type { ReactNode } from 'react'

import {
  CountedTextarea,
  ErrorSummary,
  FieldError,
  SendRow,
  SpamFields,
  describedBy,
} from '@/components/forms/FormParts'
import { type FormAction, usePublicForm } from '@/components/forms/usePublicForm'
import type { DataRequestState } from '@/lib/forms/data-request'
import type { DataRequestValues } from '@/lib/forms/data-request-schema'
import { DETAILS_MAX, FORM_INPUTS } from '@/lib/forms/fields'

// The data-request form (M4b, D49; the M4b design §7.8): the email address the confirmation link
// goes to, what the person asks for, an optional name and the details. Built like the other public
// forms: the server checks everything and returns the messages, so the form works the same without
// JavaScript apart from the spam check, which usePublicForm adds with the busy state and focus. All
// text comes from messages, through `text`.

export type DataRequestText = {
  errorTitle: string
  errorPrefix: string
  email: { label: string; hint: string }
  kind: { legend: string; options: { value: string; label: string; hint: string }[] }
  name: { label: string; hint: string }
  details: { label: string; hint: string; left: string; over: string }
  honeypot: string
  spamNote: ReactNode
  submit: string
  sending: string
}

type Props = {
  action: FormAction<DataRequestValues>
  initial: DataRequestState
  /**
   * Where the form is sent without JavaScript: the page without a fragment, so that the browser
   * moves focus to the error summary (it skips `autofocus` when the address names an element, as
   * `#request-form` does).
   */
  permalink: string
  text: DataRequestText
}

const ID = 'request'
/** Where each field's error summary link leads (the first radio button for the kind). */
const TARGETS = {
  email: `${ID}-email`,
  kind: `${ID}-kind-0`,
  name: `${ID}-name`,
  details: `${ID}-details`,
} as const
type Field = keyof typeof TARGETS

export function DataRequestForm({ action, initial, permalink, text }: Props) {
  const { state, formAction, busy, answer, summary, onSubmit, onFocus } = usePublicForm(
    action,
    initial,
    permalink,
  )
  const { values, fieldErrors: errors } = state

  const errorId = (field: Field) => errors[field] && `${ID}-${field}-error`
  const errorOf = (field: Field) => (
    <FieldError id={`${ID}-${field}-error`} prefix={text.errorPrefix} message={errors[field]} />
  )
  const failed = (Object.keys(TARGETS) as Field[]).filter((field) => errors[field])

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      onFocus={onFocus}
      noValidate
      className="grid gap-8"
    >
      <ErrorSummary
        key={state.attempt}
        id={ID}
        title={text.errorTitle}
        formError={state.formError}
        items={failed.map((field) => ({ target: TARGETS[field], message: errors[field] ?? '' }))}
        summaryRef={summary}
      />

      <input type="hidden" name={FORM_INPUTS.locale} value="en" />

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
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy(`${ID}-email-hint`, errorId('email'))}
          className="input"
        />
      </div>

      {/* The group is described by its error message, as radio buttons take no aria-invalid. */}
      <fieldset className="field" aria-describedby={describedBy(errorId('kind'))}>
        <legend className="field-label">{text.kind.legend}</legend>
        {errorOf('kind')}
        <div className="grid gap-4">
          {text.kind.options.map(({ value, label, hint }, index) => (
            <div key={value} className="grid gap-1">
              <div className="choice">
                <input
                  id={`${ID}-kind-${index}`}
                  type="radio"
                  name="kind"
                  value={value}
                  required
                  defaultChecked={values.kind === value}
                  aria-describedby={`${ID}-kind-${index}-hint`}
                />
                <label htmlFor={`${ID}-kind-${index}`}>{label}</label>
              </div>
              <p id={`${ID}-kind-${index}-hint`} className="field-hint choice-hint">
                {hint}
              </p>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={TARGETS.name} className="field-label">
          {text.name.label}
        </label>
        <p id={`${ID}-name-hint`} className="field-hint">
          {text.name.hint}
        </p>
        {errorOf('name')}
        <input
          id={TARGETS.name}
          name="name"
          type="text"
          autoComplete="name"
          defaultValue={values.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy(`${ID}-name-hint`, errorId('name'))}
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor={TARGETS.details} className="field-label">
          {text.details.label}
        </label>
        <p id={`${ID}-details-hint`} className="field-hint">
          {text.details.hint}
        </p>
        {errorOf('details')}
        <CountedTextarea
          id={TARGETS.details}
          name="details"
          max={DETAILS_MAX}
          rows={6}
          defaultValue={values.details}
          version={state.attempt}
          left={text.details.left}
          over={text.details.over}
          invalid={Boolean(errors.details)}
          describedBy={describedBy(`${ID}-details-hint`, errorId('details'))}
        />
      </div>

      <SpamFields id={ID} honeypot={text.honeypot} answerRef={answer} />
      <SendRow note={text.spamNote} busy={busy} submit={text.submit} sending={text.sending} />
    </form>
  )
}
