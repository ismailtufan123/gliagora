'use client'

import type { ReactNode } from 'react'

import {
  ErrorSummary,
  FieldError,
  SendRow,
  SpamFields,
  describedBy,
} from '@/components/forms/FormParts'
import { type FormAction, usePublicForm } from '@/components/forms/usePublicForm'
import { FORM_INPUTS } from '@/lib/forms/fields'
import type { NewsletterState } from '@/lib/forms/newsletter'
import type { NewsletterValues } from '@/lib/forms/newsletter-schema'

// The Glia Notes signup form (M2, D50; PLAN §9.10): the email address the confirmation link goes
// to and the unticked consent box, with the same words as the account's Glia Notes setting. Built
// like the other public forms: the server checks everything and returns the messages, so the form
// works the same without JavaScript apart from the spam check, which usePublicForm adds with the
// busy state and focus. All text comes from messages, through `text`.

export type NewsletterText = {
  errorTitle: string
  errorPrefix: string
  email: { label: string; hint: string }
  consent: { label: string; hint: ReactNode }
  honeypot: string
  spamNote: ReactNode
  submit: string
  sending: string
}

type Props = {
  action: FormAction<NewsletterValues>
  initial: NewsletterState
  text: NewsletterText
}

const ID = 'newsletter'
const TARGETS = { email: `${ID}-email`, consent: `${ID}-consent` } as const
type Field = keyof typeof TARGETS

export function NewsletterForm({ action, initial, text }: Props) {
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
          required
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
            required
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
