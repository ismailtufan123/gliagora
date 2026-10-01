import config from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'

import { newReference } from '@/lib/forms/public-form'

import { type Provider, memberAuthConfig } from './config'
import { SESSION_COOKIE, SIGN_IN_COOKIE, clearedCookie, signInCookie } from './cookies'
import type { ProviderIncoming } from './identity'
import {
  type VerifiedIdentity,
  authorizationRequest,
  failureSummary,
  oauthErrorCode,
  verifyCallback,
} from './oidc'
import { appOrigin, startedHere } from './origin'
import { type ErrorCode, outcomePath } from './outcome'
import { MEMBER_PATHS, providerCallbackPath } from './paths'
import { linkProvider, rotateSession, signInWithProvider } from './provider-sign-in'
import { seeOther, toProvider } from './responses'
import { DEFAULT_NEXT, parseSave, safeNext, saveValue } from './return-path'
import { sealSignIn } from './seal'
import { findSession, memberDb } from './store'

// The routes of signing in with Google or ORCID (M4b, D49; the M4b design §5, §7.2):
// `/en/sign-in/{google,orcid}/` starts, `/en/sign-in/{google,orcid}/callback/` finishes. Both are
// GETs: a start is a link (the CSP's `form-action 'self'` blocks a form whose answer redirects to
// another site), and the provider returns the browser with a redirect. Every answer is a 303 with
// a relative Location, except the one to the provider. Nothing about the person is logged: a
// failure gets a reference, the provider, the step and the error's class and code (and the
// provider's OAuth error code), as `Sign-in failed (reference 3F2A9C01D4, google callback):
// OperationProcessingError OAUTH_JWT_CLAIM_COMPARISON_FAILED`.

const secret = () => process.env.PAYLOAD_SECRET ?? ''

/** The redirect URI registered with the provider, on the site's own origin. */
export const redirectUri = (origin: string, provider: Provider) =>
  `${origin}${providerCallbackPath(provider)}`

function logFailure(provider: Provider, step: string, error: unknown): string {
  const reference = newReference()
  const code = oauthErrorCode(error)
  console.error(
    `Sign-in failed (reference ${reference}, ${provider} ${step}): ${failureSummary(error)}${code ? ` error=${code}` : ''}`,
  )
  return reference
}

/**
 * Whether this browser is signed in, for where a callback without a flow reports it. A database
 * that cannot be reached counts as signed out: the sign-in page then says the same.
 */
async function hasSession(token: string | undefined, now: Date): Promise<boolean> {
  if (!token) return false
  try {
    return (await findSession(memberDb(await getPayload({ config })), token, now)) !== null
  } catch {
    return false
  }
}

/** The sign-in page with an outcome, keeping where the person was going. */
const signInOutcome = (outcome: { error: ErrorCode; reference?: string }, next?: string) =>
  outcomePath(MEMBER_PATHS.signIn, outcome, { next: next === DEFAULT_NEXT ? null : next })

/**
 * GET `/en/sign-in/{provider}/`: seals this flow into the sign-in cookie and sends the browser to
 * the provider. `next` (where to go afterwards) and `save` (a job to save, from PR 4 on) travel in
 * the cookie. `link=1` adds the provider to the signed-in account instead: only from the site's own
 * pages (Sec-Fetch-Site), so another site cannot start it in a signed-in browser (a browser that
 * does not send the header, or an address opened from elsewhere, is told so on the account page),
 * and only while signed in. With the method off, or no known origin, back to the sign-in page.
 */
export async function startProviderSignIn(provider: Provider, request: Request) {
  const origin = appOrigin(request.headers)
  const settings = memberAuthConfig()[provider]
  if (!origin || !settings.on) return seeOther(MEMBER_PATHS.signIn)
  const query = new URL(request.url).searchParams
  const link = query.get('link') === '1'
  const now = new Date()
  let memberId: number | undefined
  if (link) {
    if (!startedHere(request.headers)) {
      return seeOther(outcomePath(MEMBER_PATHS.account, { error: 'link-not-started' }))
    }
    try {
      const db = memberDb(await getPayload({ config }))
      const session = await findSession(db, (await cookies()).get(SESSION_COOKIE)?.value, now)
      if (!session) return seeOther(MEMBER_PATHS.account)
      memberId = session.member.id
    } catch (error) {
      const reference = logFailure(provider, 'link start', error)
      return seeOther(outcomePath(MEMBER_PATHS.account, { error: 'failed', reference }))
    }
  }
  const next = link ? DEFAULT_NEXT : safeNext(query.get('next'), origin)
  const save = link ? null : parseSave(query.get('save'))
  try {
    const { url, flow } = await authorizationRequest(
      provider,
      settings,
      redirectUri(origin, provider),
    )
    const sealed = sealSignIn(
      {
        kind: 'oauth',
        p: provider,
        ...flow,
        intent: link ? 'link' : 'sign-in',
        ...(memberId ? { memberId } : {}),
        next,
        ...(save ? { save: saveValue(save) } : {}),
      },
      secret(),
      now,
    )
    return toProvider(url, [signInCookie(sealed)])
  } catch (error) {
    const reference = logFailure(provider, 'start', error)
    return seeOther(
      link
        ? outcomePath(MEMBER_PATHS.account, { error: 'failed', reference })
        : signInOutcome({ error: 'failed', reference }, next),
    )
  }
}

/** What a verified identity proves, for the account rules (identity.ts). */
export const incomingOf = (identity: VerifiedIdentity): ProviderIncoming =>
  identity.provider === 'google'
    ? { method: 'google', sub: identity.sub, email: identity.email }
    : { method: 'orcid', sub: identity.sub }

/**
 * GET `/en/sign-in/{provider}/callback/`: the provider's answer. The sign-in cookie always goes
 * (or is replaced by the "Create account" step's). A sign-in signs in (a new session), or leads to
 * "Create your Gliagora account" for an identity no account has; a link adds the provider to the
 * account that started it, if this browser is still signed in to it. Every change of sign-in
 * methods ends the member's other sessions. Without a flow (the cookie expired, or another flow
 * replaced it), a browser that is signed in hears so on its account page, where the Link buttons
 * are; any other on the sign-in page.
 */
export async function finishProviderSignIn(provider: Provider, request: Request) {
  const cleared = clearedCookie(SIGN_IN_COOKIE)
  const origin = appOrigin(request.headers)
  const settings = memberAuthConfig()[provider]
  if (!origin || !settings.on) return seeOther(MEMBER_PATHS.signIn, [cleared])
  const jar = await cookies()
  const now = new Date()
  const result = await verifyCallback({
    provider,
    settings,
    sealed: jar.get(SIGN_IN_COOKIE)?.value,
    secret: secret(),
    now,
    params: new URL(request.url).searchParams,
    redirectUri: redirectUri(origin, provider),
  })
  if (!result.ok) {
    if (!result.flow) {
      const signedIn = await hasSession(jar.get(SESSION_COOKIE)?.value, now)
      return seeOther(
        signedIn
          ? outcomePath(MEMBER_PATHS.account, { error: 'expired' })
          : signInOutcome({ error: 'expired' }),
        [cleared],
      )
    }
    const linking = result.flow.intent === 'link'
    const outcome =
      result.error === 'failed'
        ? { error: 'failed' as const, reference: logFailure(provider, 'callback', result.cause) }
        : result.error === 'cancelled'
          ? { error: `cancelled-${provider}` as const }
          : { error: 'expired' as const }
    return seeOther(
      linking
        ? outcomePath(MEMBER_PATHS.account, outcome)
        : signInOutcome(outcome, result.flow.next),
      [cleared],
    )
  }

  const { flow, identity } = result
  const current = jar.get(SESSION_COOKIE)?.value
  try {
    const db = memberDb(await getPayload({ config }))
    if (flow.intent === 'link') {
      const session = await findSession(db, current, now)
      if (!session || session.member.id !== flow.memberId) {
        return seeOther(outcomePath(MEMBER_PATHS.account, { error: 'link-interrupted' }), [cleared])
      }
      const linked = await linkProvider(db, session.member.id, incomingOf(identity), now)
      if (linked.kind === 'refused') {
        return seeOther(outcomePath(MEMBER_PATHS.account, { error: linked.reason }), [cleared])
      }
      const done = provider === 'google' ? 'linked-google' : 'linked-orcid'
      if (!linked.changed) return seeOther(outcomePath(MEMBER_PATHS.account, { done }), [cleared])
      const { cookie, othersEnded } = await rotateSession(db, session.member.id, now, {
        replaces: current,
        endOthers: true,
      })
      return seeOther(outcomePath(MEMBER_PATHS.account, { done, othersEnded: othersEnded > 0 }), [
        cookie,
        cleared,
      ])
    }

    const signedIn = await signInWithProvider(db, incomingOf(identity), now)
    switch (signedIn.kind) {
      case 'refused':
        return seeOther(signInOutcome({ error: signedIn.reason }, flow.next), [cleared])
      case 'confirm': {
        // The identity waits, sealed, for "Create account" (15 minutes).
        const pending = sealSignIn(
          {
            kind: 'confirm',
            p: provider,
            sub: identity.sub,
            ...(identity.provider === 'google' && identity.email ? { email: identity.email } : {}),
            ...(identity.provider === 'google' && identity.ignored
              ? { ignoredEmail: identity.ignored.email, ignoredReason: identity.ignored.reason }
              : {}),
            ...(identity.provider === 'orcid' && identity.name ? { name: identity.name } : {}),
            next: flow.next,
            ...(flow.save ? { save: flow.save } : {}),
          },
          secret(),
          now,
        )
        return seeOther(MEMBER_PATHS.signInConfirm, [signInCookie(pending)])
      }
      case 'signed-in':
      case 'created': {
        // Signed out, a change is Google added to the account of its address (the M4b design
        // §7.3), which the account page then says, with the other browsers signed out.
        const changed = signedIn.kind === 'signed-in' && signedIn.changed
        const { cookie, othersEnded } = await rotateSession(db, signedIn.memberId, now, {
          replaces: current,
          endOthers: changed,
        })
        const target =
          flow.next === DEFAULT_NEXT
            ? outcomePath(MEMBER_PATHS.account, {
                done: changed ? 'signed-in-linked-google' : 'signed-in',
                othersEnded: othersEnded > 0,
              })
            : flow.next
        return seeOther(target, [cookie, cleared])
      }
    }
  } catch (error) {
    const reference = logFailure(provider, 'callback', error)
    return seeOther(
      flow.intent === 'link'
        ? outcomePath(MEMBER_PATHS.account, { error: 'failed', reference })
        : signInOutcome({ error: 'failed', reference }, flow.next),
      [cleared],
    )
  }
}
