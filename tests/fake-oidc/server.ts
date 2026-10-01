import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomInt,
  sign,
} from 'node:crypto'
import { readFileSync } from 'node:fs'
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

// A fake Google and a fake ORCID for the tests and for trying sign-in locally (M4b, D49; the M4b
// design §10). TEST ONLY: it signs whatever identity its form is given, with a key that is public
// in this repository (test-key.json). The app trusts it only through AUTH_TEST_ISSUER, which it
// honours on this computer only and never where PAYLOAD_JOBS_AUTORUN is "true"
// (src/lib/members/config.ts). Never part of the Docker image (.dockerignore leaves out tests/).
//
// Node.js built-ins only, written as TypeScript that Node runs as it is (`pnpm fake:oidc`), and
// importable by the unit tests (`startFakeOidc`). Two issuers, `<base>/google` and `<base>/orcid`,
// each with discovery, signing keys (`/jwks`), an authorization page (`/authorize`) and a token
// endpoint (`/token`), shaped like the real ones:
// - Google: client secret in the body or the Basic header, PKCE (S256) advertised and required,
//   the nonce echoed, claims `sub`, `email`, `email_verified` and, for a Workspace account, `hd`;
// - ORCID (as https://orcid.org/.well-known/openid-configuration says): client secret in the body
//   only, PKCE not advertised (a challenge sent anyway is ignored, as unknown parameters are), the
//   nonce echoed, `sub` (the iD) and the record's names, no email; the token response also carries
//   `orcid` and `name`.
// The authorization page is a small form with the identity to sign in as (prefilled: a test can
// just press Continue) and a fault to answer with, to test the app's checks of the ID token;
// "Deny" answers `error=access_denied`, as a provider does when the person declines.

export type FakeProvider = 'google' | 'orcid'

/** The client both fake providers know (src/lib/members/config.ts `TEST_CLIENT`; a test checks). */
export const FAKE_CLIENT = { id: 'gliagora-test', secret: 'test-secret' } as const

/** What the ID token can do wrong, to test the app's checks. */
export const FAULTS = [
  'none',
  'wrong-nonce',
  'no-nonce',
  'wrong-aud',
  'wrong-iss',
  'expired',
  'bad-signature',
  'unverified-email',
  'non-authoritative-email',
] as const

export type Fault = (typeof FAULTS)[number]

/** One request the fake answered, for tests that check what the app sent (never the values). */
export type FakeRequest =
  | {
      provider: FakeProvider
      endpoint: 'authorize'
      scope: string | null
      prompt: string | null
      loginHint: boolean
      nonce: boolean
      codeChallenge: boolean
    }
  | {
      provider: FakeProvider
      endpoint: 'token'
      clientAuth: 'post' | 'basic' | 'none'
      codeVerifier: boolean
      status: number
    }

export type FakeOidc = {
  /** Where the issuers live: `${base}/google`, `${base}/orcid`. */
  base: string
  /** The requests answered so far, oldest first (at most the last 200). */
  requests: FakeRequest[]
  close(): Promise<void>
}

export type FakeOidcOptions = {
  /** 0 picks a free port (unit tests). */
  port?: number
  /** Only this computer: the app and the browser both reach it at 127.0.0.1. */
  host?: string
  /**
   * The address the app and the browser use (AUTH_TEST_ISSUER), which the issuers are named after;
   * by default the one it listens on.
   */
  base?: string
}

type ProviderSpec = {
  scopes: string[]
  authMethods: ('client_secret_post' | 'client_secret_basic')[]
  pkce: boolean
}

const PROVIDERS: Record<FakeProvider, ProviderSpec> = {
  google: {
    scopes: ['openid', 'email'],
    authMethods: ['client_secret_post', 'client_secret_basic'],
    pkce: true,
  },
  orcid: { scopes: ['openid'], authMethods: ['client_secret_post'], pkce: false },
}

type Grant = {
  provider: FakeProvider
  redirectUri: string
  challenge: string | null
  nonce: string | null
  claims: Record<string, unknown>
  fault: Fault
  expires: number
}

const CODE_LIFETIME_MS = 60_000
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url')

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** The fixed test key (test-key.json), so a running app keeps trusting a restarted fake. */
function loadKey() {
  const file = JSON.parse(readFileSync(new URL('./test-key.json', import.meta.url), 'utf8')) as {
    kid: string
    privateJwk: Record<string, string>
  }
  const privateKey = createPrivateKey({ key: file.privateJwk, format: 'jwk' })
  const publicJwk = createPublicKey(privateKey).export({ format: 'jwk' })
  return {
    kid: file.kid,
    privateKey,
    publicJwk: { ...publicJwk, kid: file.kid, use: 'sig', alg: 'RS256' },
  }
}

/** A random ORCID iD with a valid check character, starting 9999 (outside ORCID's ranges). */
export function fakeOrcidId(): string {
  const digits = `9999${Array.from({ length: 11 }, () => randomInt(10)).join('')}`
  let total = 0
  for (const digit of digits) total = (total + Number(digit)) * 2
  const check = (12 - (total % 11)) % 11
  const all = `${digits}${check === 10 ? 'X' : check}`
  return all.match(/.{4}/g)!.join('-')
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

function send(response: ServerResponse, status: number, body: unknown, type = 'application/json') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  response.end(typeof body === 'string' ? body : JSON.stringify(body))
}

/** A redirect address the fake may send the browser to: a page on this computer only. */
function loopbackUrl(value: string | null): URL | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && LOOPBACK.has(url.hostname) ? url : null
  } catch {
    return null
  }
}

function authorizePage(provider: FakeProvider, issuer: string, query: URLSearchParams): string {
  const hidden = [...query.entries()]
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join('\n')
  const field = (name: string, label: string, value: string) =>
    `<p><label for="${name}">${label}</label><br><input id="${name}" name="${name}" value="${escapeHtml(value)}" size="40"></p>`
  const fields =
    provider === 'google'
      ? [
          field(
            'sub',
            'Google account ID (sub)',
            String(randomInt(1e9, 9e9)) + String(randomInt(1e9, 9e9)),
          ),
          field('email', 'Email address', `m-${randomBytes(6).toString('hex')}@example.org`),
          '<p><label><input type="checkbox" name="email_verified" value="true" checked> Email address verified</label></p>',
          field('hd', 'Workspace domain (hd, empty for none)', 'example.org'),
        ]
      : [
          field('sub', 'ORCID iD (sub)', fakeOrcidId()),
          field('given_name', 'Given name', 'Josiah'),
          field('family_name', 'Family name', 'Carberry'),
          field('name', 'Name', 'Josiah Carberry'),
        ]
  const faults = FAULTS.map((fault) => `<option value="${fault}">${fault}</option>`).join('')
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fake ${provider} (test only)</title></head>
<body>
<main>
<h1>Fake ${provider} sign-in (test only)</h1>
<form method="post" action="${escapeHtml(issuer)}/authorize">
${hidden}
${fields.join('\n')}
<p><label for="fault">Fault in the answer</label><br><select id="fault" name="fault">${faults}</select></p>
<p><button name="decision" value="allow">Continue</button> <button name="decision" value="deny">Deny</button></p>
</form>
</main>
</body>
</html>`
}

/** The claims the form asks for, as the provider would send them. */
function claimsFrom(provider: FakeProvider, form: URLSearchParams, fault: Fault) {
  const text = (name: string) => form.get(name)?.trim() || undefined
  if (provider === 'google') {
    const hd = fault === 'non-authoritative-email' ? undefined : text('hd')
    const email = text('email')
    return {
      sub: text('sub') ?? '',
      ...(email
        ? {
            email,
            email_verified: fault !== 'unverified-email' && form.get('email_verified') === 'true',
          }
        : {}),
      ...(hd ? { hd } : {}),
    }
  }
  return {
    sub: text('sub') ?? '',
    ...(text('given_name') ? { given_name: text('given_name') } : {}),
    ...(text('family_name') ? { family_name: text('family_name') } : {}),
    ...(text('name') ? { name: text('name') } : {}),
  }
}

export async function startFakeOidc({
  port = 9400,
  host = '127.0.0.1',
  base: publicBase,
}: FakeOidcOptions = {}): Promise<FakeOidc> {
  const key = loadKey()
  const grants = new Map<string, Grant>()
  const requests: FakeRequest[] = []
  const record = (entry: FakeRequest) => {
    requests.push(entry)
    if (requests.length > 200) requests.shift()
  }
  let base = ''

  const jwt = (claims: Record<string, unknown>, badSignature: boolean) => {
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: key.kid }))
    const body = b64url(JSON.stringify(claims))
    const signature = sign('sha256', Buffer.from(`${head}.${body}`), key.privateKey)
    if (badSignature) signature[0] = signature[0]! ^ 0xff
    return `${head}.${body}.${b64url(signature)}`
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', base)
      const [, name, ...rest] = url.pathname.split('/')
      if (name !== 'google' && name !== 'orcid') return send(response, 404, { error: 'not_found' })
      const provider: FakeProvider = name
      const spec = PROVIDERS[provider]
      const issuer = `${base}/${provider}`
      const path = `/${rest.join('/')}`

      if (path === '/.well-known/openid-configuration' && request.method === 'GET') {
        return send(response, 200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          scopes_supported: spec.scopes,
          token_endpoint_auth_methods_supported: spec.authMethods,
          claims_supported:
            provider === 'google'
              ? ['aud', 'email', 'email_verified', 'exp', 'hd', 'iat', 'iss', 'sub']
              : ['family_name', 'given_name', 'name', 'auth_time', 'iss', 'sub'],
          ...(spec.pkce ? { code_challenge_methods_supported: ['S256'] } : {}),
        })
      }

      if (path === '/jwks' && request.method === 'GET') {
        return send(response, 200, { keys: [key.publicJwk] })
      }

      if (path === '/authorize' && request.method === 'GET') {
        const q = url.searchParams
        record({
          provider,
          endpoint: 'authorize',
          scope: q.get('scope'),
          prompt: q.get('prompt'),
          loginHint: q.has('login_hint'),
          nonce: q.has('nonce'),
          codeChallenge: q.has('code_challenge'),
        })
        const problem =
          q.get('response_type') !== 'code'
            ? 'response_type'
            : q.get('client_id') !== FAKE_CLIENT.id
              ? 'client_id'
              : !loopbackUrl(q.get('redirect_uri'))
                ? 'redirect_uri'
                : !q.get('state')
                  ? 'state'
                  : !(q.get('scope') ?? '').split(' ').includes('openid')
                    ? 'scope'
                    : spec.pkce &&
                        (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge'))
                      ? 'code_challenge'
                      : null
        if (problem) return send(response, 400, `Fake ${provider}: bad ${problem}`, 'text/plain')
        return send(response, 200, authorizePage(provider, issuer, q), 'text/html; charset=utf-8')
      }

      if (path === '/authorize' && request.method === 'POST') {
        const form = await readForm(request)
        const target = loopbackUrl(form.get('redirect_uri'))
        if (!target || form.get('client_id') !== FAKE_CLIENT.id) {
          return send(response, 400, `Fake ${provider}: bad request`, 'text/plain')
        }
        target.searchParams.set('state', form.get('state') ?? '')
        if (form.get('decision') !== 'allow') {
          target.searchParams.set('error', 'access_denied')
        } else {
          const fault = (FAULTS as readonly string[]).includes(form.get('fault') ?? '')
            ? (form.get('fault') as Fault)
            : 'none'
          const code = b64url(randomBytes(24))
          grants.set(code, {
            provider,
            redirectUri: form.get('redirect_uri') ?? '',
            // ORCID ignores a challenge, as it does any parameter it does not know.
            challenge: spec.pkce ? (form.get('code_challenge') ?? null) : null,
            nonce: form.get('nonce') || null,
            claims: claimsFrom(provider, form, fault),
            fault,
            expires: Date.now() + CODE_LIFETIME_MS,
          })
          target.searchParams.set('code', code)
        }
        response.writeHead(303, { Location: target.toString(), 'Cache-Control': 'no-store' })
        return response.end()
      }

      if (path === '/token' && request.method === 'POST') {
        const form = await readForm(request)
        const basic = /^Basic (.+)$/.exec(request.headers.authorization ?? '')?.[1]
        const clientAuth = basic ? 'basic' : form.has('client_secret') ? 'post' : 'none'
        const answer = (status: number, body: unknown) => {
          record({
            provider,
            endpoint: 'token',
            clientAuth,
            codeVerifier: form.has('code_verifier'),
            status,
          })
          return send(response, status, body)
        }
        const [id, secret] = basic
          ? Buffer.from(basic, 'base64').toString('utf8').split(':').map(decodeURIComponent)
          : [form.get('client_id'), form.get('client_secret')]
        const allowed =
          clientAuth === 'basic'
            ? spec.authMethods.includes('client_secret_basic')
            : clientAuth === 'post'
        if (!allowed || id !== FAKE_CLIENT.id || secret !== FAKE_CLIENT.secret) {
          return answer(401, { error: 'invalid_client' })
        }
        const code = form.get('code') ?? ''
        const grant = grants.get(code)
        grants.delete(code)
        const verifier = form.get('code_verifier')
        const pkceOk = grant?.challenge
          ? verifier !== null &&
            b64url(createHash('sha256').update(verifier).digest()) === grant.challenge
          : !spec.pkce || verifier === null
        if (
          form.get('grant_type') !== 'authorization_code' ||
          !grant ||
          grant.provider !== provider ||
          grant.expires < Date.now() ||
          grant.redirectUri !== form.get('redirect_uri') ||
          !pkceOk
        ) {
          return answer(400, { error: 'invalid_grant' })
        }
        const now = Math.floor(Date.now() / 1000)
        const issuedAt = grant.fault === 'expired' ? now - 3600 : now
        const nonce =
          grant.fault === 'no-nonce'
            ? null
            : grant.fault === 'wrong-nonce'
              ? b64url(randomBytes(16))
              : grant.nonce
        const idToken = jwt(
          {
            iss: grant.fault === 'wrong-iss' ? `${base}/elsewhere` : issuer,
            aud: grant.fault === 'wrong-aud' ? 'another-client' : FAKE_CLIENT.id,
            iat: issuedAt,
            exp: issuedAt + 600,
            auth_time: issuedAt,
            ...(nonce ? { nonce } : {}),
            ...grant.claims,
          },
          grant.fault === 'bad-signature',
        )
        return answer(200, {
          access_token: b64url(randomBytes(24)),
          token_type: 'Bearer',
          expires_in: 3600,
          scope: spec.scopes.join(' '),
          id_token: idToken,
          ...(provider === 'orcid'
            ? { orcid: grant.claims.sub, name: grant.claims.name ?? null }
            : {}),
        })
      }
      return send(response, 404, { error: 'not_found' })
    } catch {
      return send(response, 500, { error: 'server_error' })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })
  const address = server.address() as AddressInfo
  const hostname = address.family === 'IPv6' ? `[${address.address}]` : address.address
  base = publicBase?.replace(/\/+$/, '') ?? `http://${hostname}:${address.port}`
  return {
    base,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

// `pnpm fake:oidc`: listens where AUTH_TEST_ISSUER says (by default http://127.0.0.1:9400), until
// stopped. Playwright starts it this way when AUTH_TEST_ISSUER is set (playwright.config.ts).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const where = new URL(process.env.AUTH_TEST_ISSUER || 'http://127.0.0.1:9400')
  if (!LOOPBACK.has(where.hostname) || where.pathname.replace(/\/+$/, '') !== '') {
    console.error('AUTH_TEST_ISSUER must be http://<this computer>:<port>, without a path.')
    process.exit(1)
  }
  const fake = await startFakeOidc({
    host: where.hostname.replace(/^\[|\]$/g, ''),
    port: Number(where.port || 80),
    base: where.origin,
  })
  console.log(`Fake Google and ORCID (test only) at ${fake.base}/google and ${fake.base}/orcid`)
  const stop = () => void fake.close().then(() => process.exit(0))
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
