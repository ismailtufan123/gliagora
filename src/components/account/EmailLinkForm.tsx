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
import type { FormState } from '@/lib/forms/public-form'

// The forms that email a link to an address (M4b, D49): asking for a sign-in link (with where to
// go afterwards and the position to save then, from a Save link, in hidden inputs), and adding or
// changing the account's address (/en/account/). One field, the email address. Built like the
// other public forms: the server checks everything and returns the messages, so the form works
// the same without JavaScript apart from the spam check, which usePublicForm adds with the busy
// state and focus. All text comes from messages, through `text`.

export type EmailLinkText = {
  errorTitle: string
  errorPrefix: string
  email: { label: string; hint: string }
  honeypot: string
  spamNote: ReactNode
  submit: string
  sending: string
}

/** What the form shows again after an error: the address, and the sign-in form's hidden inputs. */
export type EmailLinkValues = { email: string; next?: string; save?: string }

type Props<Values extends EmailLinkValues> = {
  /** Unique on the page: the ids of the form's elements start with it. */
  id: string
  action: FormAction<Values>
  initial: FormState<Values>
  /** Where the form is sent without JavaScript: the page without an outcome (SignInPanel). */
  permalink: string
  text: EmailLinkText
}

export function EmailLinkForm<Values extends EmailLinkValues>({
  id,
  action,
  initial,
  permalink,
  text,
}: Props<Values>) {
  const { state, formAction, busy, answer, summary, onSubmit, onFocus } = usePublicForm(
    action,
    initial,
    permalink,
  )
  const { values, fieldErrors: errors } = state
  const field = `${id}-email`
  const errorId = errors.email && `${field}-error`

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
        id={id}
        title={text.errorTitle}
        formError={state.formError}
        items={errors.email ? [{ target: field, message: errors.email }] : []}
        summaryRef={summary}
      />

      <input type="hidden" name={FORM_INPUTS.locale} value="en" />
      {values.next && <input type="hidden" name={FORM_INPUTS.next} value={values.next} />}
      {values.save && <input type="hidden" name={FORM_INPUTS.save} value={values.save} />}

      <div className="field">
        <label htmlFor={field} className="field-label">
          {text.email.label}
        </label>
        <p id={`${field}-hint`} className="field-hint">
          {text.email.hint}
        </p>
        <FieldError id={`${field}-error`} prefix={text.errorPrefix} message={errors.email} />
        <input
          id={field}
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          defaultValue={values.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy(`${field}-hint`, errorId)}
          className="input"
        />
      </div>

      <SpamFields id={id} honeypot={text.honeypot} answerRef={answer} />
      <SendRow note={text.spamNote} busy={busy} submit={text.submit} sending={text.sending} />
    </form>
  )
}
