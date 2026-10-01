// The addresses of the data-request form and the pages after it (M4b, D49; the M4b design §5,
// §7.8). English only, as the form is. The page itself is a legal text (content/en/legal/
// data-requests.md, indexed once approved); the pages after it are about one request and never
// indexed (`dataRequestPageIndexed()`, src/lib/indexing.ts). Caddy removes the query strings of
// every address under the page from its logs (deploy/Caddyfile), so the confirmation link's token
// is never written there.

const PAGE = '/en/legal/data-requests/'

export const DATA_REQUEST_PATHS = {
  /** The legal text with the form at its end. */
  page: PAGE,
  /** The form's own place on the page, which the text links to. */
  form: `${PAGE}#request-form`,
  /** After sending the form (and after a filled-in hidden field): check your inbox. */
  sent: `${PAGE}sent/`,
  /** Where the emailed link leads (`?token=`): only looks the link up. */
  confirm: `${PAGE}confirm/`,
  /** The POST route behind the confirmation page's button. */
  confirmUse: `${PAGE}confirm/use/`,
  /** After a confirmed deletion. */
  done: `${PAGE}done/`,
  /** After any other confirmed request. */
  received: `${PAGE}received/`,
} as const

/** The id of the form's section on the page (`#request-form`). */
export const REQUEST_FORM_ID = 'request-form'
