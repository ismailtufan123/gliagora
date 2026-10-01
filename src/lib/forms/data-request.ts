import { DATA_REQUEST_PATHS } from '@/lib/data-requests/paths'

import {
  type DataRequestData,
  type DataRequestErrors,
  type DataRequestValues,
  parseDataRequest,
  readDataRequestValues,
} from './data-request-schema'
import {
  type FormDependencies,
  type FormOutcome,
  type FormState,
  type PublicForm,
  handlePublicForm,
} from './public-form'
import { DATA_REQUEST_LIMIT, emailLimits, hashLimitAddress } from './rate-limit'

// The data-request form (M4b, D49; the M4b design §7.8): the checks of every public form
// (src/lib/forms/public-form.ts) with its fields. Besides its own limit per IP address (5 an hour)
// it shares the budget of the address the confirmation link goes to, and the site-wide cap, with
// every form that sends an email (`emailLimits`). The Server Action
// (src/app/(frontend)/en/legal/data-requests/actions.ts) passes in what this needs, records the
// request and emails the link. Every address gets the same answer.

/** Where the form leads once a request is taken, or seems to be (the hidden field). */
export const DATA_REQUEST_SENT_PATH = DATA_REQUEST_PATHS.sent

/** The parts of the legal texts the form links to (headings in content/…, see markdown.ts). */
export const DATA_REQUEST_LEGAL_LINKS = {
  privacy: '/en/legal/privacy/#data-requests',
  spamProtection: '/en/legal/privacy/#spam-protection-on-forms',
  takedown: '/en/legal/takedown/',
} as const

const DATA_REQUEST_FORM: PublicForm<DataRequestValues, DataRequestData, DataRequestErrors> = {
  name: 'Data request',
  limit: DATA_REQUEST_LIMIT,
  moreLimits: (data, secret) => emailLimits(hashLimitAddress(data.email, secret)),
  read: readDataRequestValues,
  parse: parseDataRequest,
}

export type DataRequestOutcome = FormOutcome<DataRequestValues, DataRequestErrors>

/** Checks a data request and, if it is taken, has `deps.save` record it and send its link. */
export function handleDataRequest(
  form: FormData,
  deps: FormDependencies<DataRequestData>,
): Promise<DataRequestOutcome> {
  return handlePublicForm(form, deps, DATA_REQUEST_FORM)
}

export type DataRequestState = FormState<DataRequestValues>

export const emptyDataRequestValues = (): DataRequestValues => ({
  email: '',
  kind: '',
  name: '',
  details: '',
})
