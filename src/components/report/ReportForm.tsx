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
import { DETAILS_MAX, FORM_INPUTS } from '@/lib/forms/fields'
import type { ReportState } from '@/lib/forms/report'
import type { ReportValues } from '@/lib/forms/report-schema'

// "Report a problem" (PLAN §3.2, §7.5, §15.4): what is wrong, the details and, for a reply, an
// email address, which a request about personal rights needs. The item comes from the page's
// address and travels in a hidden input. Built like "Suggest a listing": the server checks
// everything and returns the messages; usePublicForm adds the spam check, the busy state and
// focus. All text comes from messages, through `text`.

export type ReportText = {
  errorTitle: string
  errorPrefix: string
  kind: { legend: string; options: { value: string; label: string; hint: string }[] }
  details: { label: string; hint: string; left: string; over: string }
  email: { label: string; hint: ReactNode }
  honeypot: string
  spamNote: ReactNode
  submit: string
  sending: string
}

type Props = {
  action: FormAction<ReportValues>
  initial: ReportState
  text: ReportText
}

const ID = 'report'
/** Where each field's error summary link leads (the first radio button for the kind). */
const TARGETS = {
  kind: `${ID}-kind-0`,
  details: `${ID}-details`,
  email: `${ID}-email`,
} as const
type Field = keyof typeof TARGETS

export function ReportForm({ action, initial, text }: Props) {
  const { state, formAction, busy, answer, summary, onSubmit, onFocus } = usePublicForm(
    action,
    initial,
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
      {values.item && <input type="hidden" name={FORM_INPUTS.item} value={values.item} />}

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

      <SpamFields id={ID} honeypot={text.honeypot} answerRef={answer} />
      <SendRow note={text.spamNote} busy={busy} submit={text.submit} sending={text.sending} />
    </form>
  )
}
