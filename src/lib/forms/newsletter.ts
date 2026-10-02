import { NEWSLETTER_PATHS } from '@/lib/newsletter/paths'

import {
  type NewsletterData,
  type NewsletterErrors,
  type NewsletterValues,
  parseNewsletter,
  readNewsletterValues,
} from './newsletter-schema'
import {
  type FormDependencies,
  type FormOutcome,
  type FormState,
  type PublicForm,
  handlePublicForm,
} from './public-form'
import {
  type Limit,
  NEWSLETTER_LIMIT,
  emailLimits,
  hashLimitAddress,
  newsletterWait,
} from './rate-limit'

// The Glia Notes signup form (M2, D50; PLAN §9.10, §13): the checks of every public form
// (src/lib/forms/public-form.ts) with its fields. Besides its own limit per IP address (20 an hour,
// shared with "Send it again") it waits a minute between two emails to one address
// (`newsletterWait`), and shares the budget of the address the confirmation link goes to, and the
// site-wide cap, with every form that sends an email (`emailLimits`). The Server Action
// (src/app/(frontend)/en/newsletter/actions.ts) passes in what this needs, stores the link and
// emails it. Every address gets the same answer, subscribed, waiting for its link or neither.

/** Where the form leads once a signup is taken, or seems to be (the hidden field). */
export const NEWSLETTER_SENT_PATH = NEWSLETTER_PATHS.checkInbox

/**
 * The limits of an email to `email` besides the IP's: the minute between two emails to it first
 * (so the person reads "wait a minute"), then its budget and the site-wide cap.
 */
export const newsletterEmailLimits = (email: string, secret: string): Limit[] => {
  const hash = hashLimitAddress(email, secret)
  return [newsletterWait(hash), ...emailLimits(hash)]
}

const NEWSLETTER_FORM: PublicForm<NewsletterValues, NewsletterData, NewsletterErrors> = {
  name: 'Newsletter signup',
  limit: NEWSLETTER_LIMIT,
  moreLimits: (data, secret) => newsletterEmailLimits(data.email, secret),
  read: readNewsletterValues,
  parse: parseNewsletter,
}

export type NewsletterOutcome = FormOutcome<NewsletterValues, NewsletterErrors>

/** Checks a signup and, if it is taken, has `deps.save` store its link and send it. */
export function handleNewsletterSignup(
  form: FormData,
  deps: FormDependencies<NewsletterData>,
): Promise<NewsletterOutcome> {
  return handlePublicForm(form, deps, NEWSLETTER_FORM)
}

export type NewsletterState = FormState<NewsletterValues>

export const emptyNewsletterValues = (): NewsletterValues => ({ email: '', consent: false })
