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
import type { SignInState, SignInValues } from '@/lib/forms/sign-in'

// Asking for a sign-in link (M4b, D49): the email address, with where to go afterwards in a hidden
// input. Built like the other public forms: the server checks everything and returns the
// messages, so the form works the same without JavaScript apart from the spam check, which
// usePublicForm adds with the busy state and focus. All text comes from messages, through `text`.

export type SignInText = {
  errorTitle: string
  errorPrefix: string
  email: { label: string; hint: string }
  honeypot: string
  spamNote: ReactNode
  submit: string
  sending: string
}

type Props = {
  action: FormAction<SignInValues>
  initial: SignInState
  /** Where the form is sent without JavaScript: the page without an outcome (SignInPanel). */
  permalink: string
  text: SignInText
}

const ID = 'sign-in'
const EMAIL = `${ID}-email`

export function SignInForm({ action, initial, permalink, text }: Props) {
  const { state, formAction, busy, answer, summary, onSubmit, onFocus } = usePublicForm(
    action,
    initial,
    permalink,
  )
  const { values, fieldErrors: errors } = state
  const errorId = errors.email && `${EMAIL}-error`

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
        items={errors.email ? [{ target: EMAIL, message: errors.email }] : []}
        summaryRef={summary}
      />

      <input type="hidden" name={FORM_INPUTS.locale} value="en" />
      {values.next && <input type="hidden" name={FORM_INPUTS.next} value={values.next} />}

      <div className="field">
        <label htmlFor={EMAIL} className="field-label">
          {text.email.label}
        </label>
        <p id={`${EMAIL}-hint`} className="field-hint">
          {text.email.hint}
        </p>
        <FieldError id={`${EMAIL}-error`} prefix={text.errorPrefix} message={errors.email} />
        <input
          id={EMAIL}
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          defaultValue={values.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy(`${EMAIL}-hint`, errorId)}
          className="input"
        />
      </div>

      <SpamFields id={ID} honeypot={text.honeypot} answerRef={answer} />
      <SendRow note={text.spamNote} busy={busy} submit={text.submit} sending={text.sending} />
    </form>
  )
}
