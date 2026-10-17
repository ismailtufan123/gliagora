import { randomBytes } from 'node:crypto'

import { render } from '@react-email/render'

import type { IssueContent } from './content'
import { IssueEmail } from './email'
import { type Recipient, issueLinks } from './links'
import { monthName } from './schedule'
import { issuePlainText } from './text'
import { issueText } from './words'

// An issue of Glia Notes as an email (M11, D53; PLAN §13): its subject, HTML and plain text, made
// from one content value. `renderIssue` makes the version for a preview or a test email (the
// unsubscribe links name listmonk's preview UUID, which belongs to nobody); `campaignBody` makes
// the version listmonk sends, in which listmonk writes each subscriber's own ID and UUID.

/** Gmail shows only the first 102 KB of a message's HTML (PLAN §13: keep it under 100 KB). */
export const HTML_MAX_BYTES = 100 * 1024

export type RenderedIssue = {
  subject: string
  html: string
  text: string
  /** Where a mail program's one-click unsubscribe posts (RFC 8058), for this recipient. */
  oneClick: string
}

/** React's markers in the rendered HTML (`<!--$-->`): no mail program needs them. */
const withoutComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

/** The issue as an email for one kind of recipient, with links on `origin`. */
export async function renderIssue(
  content: IssueContent,
  { origin, recipient, test = false }: { origin: string; recipient: Recipient; test?: boolean },
): Promise<RenderedIssue> {
  const t = issueText()
  const links = issueLinks(content, origin, recipient)
  const month = monthName(content.month)
  const testNote = test ? t('test.note') : undefined
  const html = withoutComments(
    await render(
      <IssueEmail content={content} links={links} t={t} month={month} testNote={testNote} />,
    ),
  )
  return {
    subject: test ? t('test.subject', { subject: content.subject }) : content.subject,
    html,
    text: issuePlainText(content, links, t, month, testNote),
    oneClick: links.oneClick,
  }
}

/** The size of a text in bytes (UTF-8). */
export const byteSize = (value: string) => Buffer.byteLength(value, 'utf8')

// listmonk reads a campaign's body, plain text and headers as Go templates (listmonk 6.2,
// models/campaigns.go: html/template for the body and the plain text, text/template for the
// subject and headers), after rewriting its shorthands (models/common.go: `https://…@TrackLink`
// becomes a call of TrackLink). Everything in them that comes from the site is text, so none of
// it may be read as a template:
// - every `{{` is written as the template `{{"{{"}}`, which prints it;
// - the shorthand `@Track…` is broken by a zero-width space after the `@`;
// - in the plain text, which html/template parses as HTML (it would print a `<` as `&lt;`, or take
//   it for the start of a tag), every `<` is written as `{{ Safe "<" }}`, listmonk's function that
//   prints it as it is.
// Only then are the subscriber's ID and UUID put in, as the template expressions listmonk fills
// for each subscriber, in the places the links reserved for them.
// tests/integration/campaigns.db.test.ts sends a campaign through a real listmonk and checks what
// arrives.

const ESCAPED_OPEN = '{{"{{"}}'
const ZERO_WIDTH_SPACE = '\u200b'
const LITERAL_LT = '{{ Safe "<" }}'

const withoutShorthands = (value: string) =>
  value.replaceAll('{{', ESCAPED_OPEN).replaceAll('@Track', `@${ZERO_WIDTH_SPACE}Track`)

/** Text that listmonk's templates print exactly as it is (the HTML body, or the plain text). */
export function literalForListmonk(value: string, kind: 'html' | 'text'): string {
  const out = withoutShorthands(value)
  // The escapes above hold no `<`, so this leaves them alone.
  return kind === 'text' ? out.replaceAll('<', LITERAL_LT) : out
}

/** The subject or a header's value, as listmonk prints it (text/template). */
export const subjectForListmonk = (subject: string) => withoutShorthands(subject)

/** listmonk's expressions for a subscriber's ID and UUID. */
export const SUBSCRIBER_ID = '{{ .Subscriber.ID }}'
export const SUBSCRIBER_UUID = '{{ .Subscriber.UUID }}'

export type CampaignBody = {
  subject: string
  html: string
  text: string
  /** RFC 8058's one-click unsubscribe, for each subscriber (listmonk's campaign headers). */
  headers: Record<string, string>[]
}

/** The campaign listmonk sends: the email of `content`, with each subscriber's own links. */
export async function campaignBody(content: IssueContent, origin: string): Promise<CampaignBody> {
  // Placeholders no content can contain (a new random value each time), replaced by listmonk's
  // expressions only after the content was made literal.
  const nonce = randomBytes(12).toString('hex')
  const id = `gnid${nonce}`
  const uuid = `gnuuid${nonce}`
  const rendered = await renderIssue(content, { origin, recipient: { kind: 'campaign', id, uuid } })
  const fill = (value: string) =>
    value.replaceAll(id, SUBSCRIBER_ID).replaceAll(uuid, SUBSCRIBER_UUID)
  return {
    subject: subjectForListmonk(rendered.subject),
    html: fill(literalForListmonk(rendered.html, 'html')),
    text: fill(literalForListmonk(rendered.text, 'text')),
    headers: [
      { 'List-Unsubscribe': `<${fill(subjectForListmonk(rendered.oneClick))}>` },
      { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    ],
  }
}

/** An issue that is over the size cap even without any deadline listed. */
export class IssueTooLargeError extends Error {
  override name = 'IssueTooLargeError'
  constructor() {
    super('The issue is larger than 100 KB even without its deadlines')
  }
}

/**
 * The content with as many deadlines as fit under the size cap (HTML_MAX_BYTES, measured on the
 * campaign's HTML, the larger version): the last ones are moved into "more", the link to the jobs
 * list, one at a time. `trimmed` says how many. Throws IssueTooLargeError when even no deadline is
 * too many (fifteen selected positions with long titles and summaries).
 */
export async function fitWithinCap(
  content: IssueContent,
  origin: string,
): Promise<{ content: IssueContent; trimmed: number }> {
  let fitted = content
  let trimmed = 0
  for (;;) {
    const { html } = await campaignBody(fitted, origin)
    if (byteSize(html) < HTML_MAX_BYTES) return { content: fitted, trimmed }
    const { jobs, more } = fitted.deadlines
    if (jobs.length === 0) throw new IssueTooLargeError()
    fitted = {
      ...fitted,
      deadlines: { ...fitted.deadlines, jobs: jobs.slice(0, -1), more: more + 1 },
    }
    trimmed++
  }
}
