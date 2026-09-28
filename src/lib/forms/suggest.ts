import {
  type FormDependencies,
  type FormOutcome,
  type FormState,
  type PublicForm,
  handlePublicForm,
} from './public-form'
import { SUGGEST_LIMIT } from './rate-limit'
import {
  type FieldErrors,
  type SuggestValues,
  type SuggestionData,
  parseSuggestion,
  readSuggestValues,
} from './suggest-schema'

// What happens when someone sends the "Suggest a listing" form (PLAN §3.2, §18.2): the checks of
// every public form (src/lib/forms/public-form.ts) with this form's fields and its own rate
// limit. The Server Action (src/app/(frontend)/en/suggest/actions.ts) passes in what this needs,
// so tests can too.

/** Where the form leads once a suggestion is taken, or seems to be (the hidden field). */
export const SUGGEST_SENT_PATH = '/en/suggest/sent/'

/** The parts of the legal texts the form links to (headings in content/…, see markdown.ts). */
export const SUGGEST_LEGAL_LINKS = {
  privacy: '/en/legal/privacy/#suggest-a-listing-form',
  spamProtection: '/en/legal/privacy/#spam-protection-on-forms',
  kvkk: '/tr/legal/kvkk-aydinlatma-metni/#ilan-onerme-formu-suggest-a-listing',
} as const

export type SuggestOutcome = FormOutcome<SuggestValues, FieldErrors>

export type SuggestDependencies = FormDependencies<SuggestionData>

const SUGGEST_FORM: PublicForm<SuggestValues, SuggestionData, FieldErrors> = {
  name: 'Suggestion',
  limit: SUGGEST_LIMIT,
  read: readSuggestValues,
  parse: parseSuggestion,
}

/**
 * Checks a suggestion and, if it is taken, stores it (the Submissions collection makes the
 * candidate for positions).
 */
export function handleSuggestion(
  form: FormData,
  deps: SuggestDependencies,
): Promise<SuggestOutcome> {
  return handlePublicForm(form, deps, SUGGEST_FORM)
}

export type SuggestState = FormState<SuggestValues>

export const EMPTY_VALUES: SuggestValues = {
  url: '',
  kind: '',
  note: '',
  email: '',
  consent: false,
}
