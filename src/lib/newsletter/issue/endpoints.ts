import type { Endpoint, PayloadRequest } from 'payload'

import { sendOne } from '@/lib/email/deliver'
import { canSendEmail } from '@/lib/email/settings'
import { errorSummary } from '@/lib/errors'
import { appOrigin, sameOrigin } from '@/lib/members/origin'
import { SITE_ORIGIN } from '@/lib/site'
import type { NewsletterIssue } from '@/payload-types'

import { buildIssueContent } from './build'
import { type IssueContent, readSnapshot } from './content'
import type { RenderedIssue } from './render'
import { seedAddresses } from './settings'
import { FROZEN_STATUSES } from './status'

// The routes behind an issue's actions in the admin (src/admin/IssueActions.tsx), for signed-in
// editors only: `/api/newsletter-issues/:id/preview/` (GET; `?format=text` for the plain text) and
// `/api/newsletter-issues/:id/test/` (POST: a test email to the editor and the seed addresses,
// through the app's mail server). They answer with counts and messages, never an address, and log
// only error classes. A preview and a test carry listmonk's preview UUID in their unsubscribe
// links, which unsubscribes nobody.

const json = (body: { ok: boolean; message: string }, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** The issue the route names, read as the signed-in editor, or null. */
async function issueOf(req: PayloadRequest): Promise<NewsletterIssue | null> {
  const id = Number(req.routeParams?.id)
  if (!req.user || !Number.isSafeInteger(id) || id < 1) return null
  return req.payload.findByID({
    collection: 'newsletter-issues',
    id,
    depth: 0,
    overrideAccess: false,
    req,
    disableErrors: true,
  })
}

/**
 * What an issue says now: its snapshot once listmonk has it scheduled, or is sending it or has sent
 * it; otherwise built from the published jobs at this moment and fitted under the size cap (as a
 * push would send it). Throws IssueTooLargeError (render.tsx) when it cannot fit.
 */
export async function contentOf(
  payload: PayloadRequest['payload'],
  issue: NewsletterIssue,
  now: Date,
  origin: string,
): Promise<{ content: IssueContent; leftOut: number; trimmed: number }> {
  const snapshot = FROZEN_STATUSES.has(issue.status) ? readSnapshot(issue.snapshot) : null
  if (snapshot) return { content: snapshot, leftOut: 0, trimmed: 0 }
  const built = await buildIssueContent(payload, issue, now)
  const { fitWithinCap } = await renderer()
  const fitted = await fitWithinCap(built.content, origin)
  return { content: fitted.content, leftOut: built.leftOut, trimmed: fitted.trimmed }
}

/** What to tell the editor about an issue that does not fit. */
const TOO_LARGE =
  'This issue is larger than 100 KB even without its deadlines: shorten the summaries of its selected positions, or remove some.'

const isTooLarge = (error: unknown) =>
  (error as { name?: unknown } | null)?.name === 'IssueTooLargeError'

/**
 * The email's renderer, loaded on first use: Payload's config (and so its command line, which
 * reads no JSX) imports this file, but only these routes render an email.
 */
const renderer = () => import('./render')

/** The site's origin for the links of an email: SERVER_URL in production. */
const originOf = (req: PayloadRequest) => appOrigin(req.headers) ?? SITE_ORIGIN

async function preview(req: PayloadRequest): Promise<Response> {
  const issue = await issueOf(req)
  if (!issue) return new Response('Not found', { status: 404 })
  const origin = originOf(req)
  let content: IssueContent
  try {
    content = (await contentOf(req.payload, issue, new Date(), origin)).content
  } catch (error) {
    if (!isTooLarge(error)) throw error
    return new Response(TOO_LARGE, {
      status: 422,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  const { renderIssue } = await renderer()
  const rendered = await renderIssue(content, { origin, recipient: { kind: 'preview' } })
  const text = new URL(req.url ?? '', 'http://localhost').searchParams.get('format') === 'text'
  return new Response(text ? rendered.text : rendered.html, {
    headers: {
      'Content-Type': `${text ? 'text/plain' : 'text/html'}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      // The email has no scripts, forms or images; its links open outside the preview.
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    },
  })
}

/** Sends one rendered issue to each address; how many were taken by the mail server. */
async function sendAll(req: PayloadRequest, rendered: RenderedIssue, to: string[]) {
  let sent = 0
  for (const address of to) {
    const result = await sendOne(req.payload, address, {
      locale: 'en',
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      unsubscribeUrl: rendered.oneClick,
    })
    if (result.status === 'sent') sent++
    else if (result.error) req.payload.logger.warn(`Glia Notes test: not sent (${result.error})`)
    else req.payload.logger.warn('Glia Notes test: the mail server did not take a message')
  }
  return sent
}

async function test(req: PayloadRequest): Promise<Response> {
  if (!sameOrigin(req.headers)) return json({ ok: false, message: 'Refused.' }, 403)
  const issue = await issueOf(req)
  if (!issue || !req.user) return json({ ok: false, message: 'No such issue.' }, 404)
  if (!canSendEmail()) {
    return json(
      {
        ok: false,
        message:
          'No mail server is set up yet (SMTP_HOST), so no test email can be sent. Use the preview until then.',
      },
      503,
    )
  }
  try {
    const origin = originOf(req)
    const { content, leftOut } = await contentOf(req.payload, issue, new Date(), origin)
    const { renderIssue } = await renderer()
    const rendered = await renderIssue(content, {
      origin,
      recipient: { kind: 'preview' },
      test: true,
    })
    const seeds = seedAddresses()
    for (const problem of seeds.problems) req.payload.logger.warn(problem)
    const own = String(req.user.email ?? '').toLowerCase()
    const to = [...new Set([own, ...seeds.addresses].filter(Boolean))]
    const sent = await sendAll(req, rendered, to)
    const others = to.length - 1
    const message = `Test sent to ${sent} of ${to.length} addresses (you${
      others > 0 ? ` and ${others} seed address${others === 1 ? '' : 'es'}` : ''
    }).${leftOut > 0 ? ` ${leftOut} selected position${leftOut === 1 ? ' is' : 's are'} no longer open and left out.` : ''}`
    return json({ ok: sent === to.length, message }, sent === to.length ? 200 : 502)
  } catch (error) {
    if (isTooLarge(error)) return json({ ok: false, message: TOO_LARGE }, 422)
    req.payload.logger.error(`Glia Notes test failed (${errorSummary(error)})`)
    return json({ ok: false, message: 'The test could not be sent. Try again in a moment.' }, 500)
  }
}

export const ISSUE_ENDPOINTS: Endpoint[] = [
  { path: '/:id/preview', method: 'get', handler: preview },
  { path: '/:id/test', method: 'post', handler: test },
]
