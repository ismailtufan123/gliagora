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
import { FORM_INPUTS, NOTE_MAX } from '@/lib/forms/fields'
import type { SuggestState } from '@/lib/forms/suggest'
import type { SuggestValues } from '@/lib/forms/suggest-schema'

// The "Suggest a listing" form (PLAN §3.2, §7.5, §9.10). Every check and message comes from the
// server (the Server Action returns the next state), so it works the same without JavaScript,
// apart from the spam check; usePublicForm adds what needs the browser. All text comes from
// messages, through `text`.

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
  action: FormAction<SuggestValues>
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

export function SuggestForm({ action, initial, text }: Props) {
  const { state, formAction, busy, answer, summary, onSubmit, onFocus } = usePublicForm(
    action,
    initial,
  )
  const { values, fieldErrors: errors } = state

  const errorId = (field: Field) => errors[field] && `${ID}-${field}-error`
  const errorOf = (field: Field) => (
    <FieldError id={`${ID}-${field}-error`} prefix={text.errorPrefix} message={errors[field]} />
  )
  const invalid = (field: Field) => (errors[field] ? true : undefined)
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
          aria-describedby={describedBy(`${ID}-url-hint`, errorId('url'))}
          className="input"
        />
      </div>

      {/* The group is described by its error message, as radio buttons take no aria-invalid. */}
      <fieldset className="field" aria-describedby={describedBy(errorId('kind'))}>
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
        <CountedTextarea
          id={TARGETS.note}
          name="note"
          max={NOTE_MAX}
          rows={4}
          defaultValue={values.note}
          version={state.attempt}
          left={text.note.left}
          over={text.note.over}
          invalid={Boolean(errors.note)}
          describedBy={describedBy(`${ID}-note-hint`, errorId('note'))}
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
          aria-invalid={invalid('email')}
          aria-describedby={describedBy(`${ID}-email-hint`, errorId('email'))}
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
            aria-describedby={describedBy(`${ID}-consent-hint`, errorId('consent'))}
          />
          <label htmlFor={TARGETS.consent}>{text.consent.label}</label>
        </div>
        <p id={`${ID}-consent-hint`} className="field-hint choice-hint">
          {text.consent.hint}
        </p>
      </div>

      <SpamFields id={ID} honeypot={text.honeypot} answerRef={answer} />
      <SendRow note={text.spamNote} busy={busy} submit={text.submit} sending={text.sending} />
    </form>
  )
}
