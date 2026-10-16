// Calls one of the app's operations routes from inside its container (M7, D52; src/lib/ops/auth.ts):
//
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/monitors/run < request.json
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs GET /api/ops/ai-drafts/export > export.json
//
// It derives the routes' key from PAYLOAD_SECRET, which the container has, and never prints it.
// The answer goes to standard output; the exit code is 1 when the route refused or failed.
// Plain JavaScript without dependencies: the Docker image copies this folder next to the server.
import { hkdfSync } from 'node:crypto'

const [method, path] = process.argv.slice(2)
if (!['GET', 'POST'].includes(method ?? '') || !/^\/api\/ops\/[a-z0-9/-]+\/$/.test(path ?? '')) {
  console.error('Usage: node ops/call.mjs GET|POST /api/ops/<route>/ [< body.json]')
  process.exit(2)
}
const secret = process.env.PAYLOAD_SECRET ?? ''
if (secret === '') {
  console.error('PAYLOAD_SECRET is not set.')
  process.exit(2)
}
const key = Buffer.from(hkdfSync('sha256', secret, '', 'gliagora/ops/token/v1', 32)).toString('hex')

let body
if (method === 'POST') {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  body = Buffer.concat(chunks).toString('utf8')
}

const port = process.env.PORT ?? '3000'
const response = await fetch(`http://127.0.0.1:${port}${path}`, {
  method,
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body,
  signal: AbortSignal.timeout(3 * 60 * 60 * 1000),
})
process.stdout.write(await response.text())
if (!response.ok) {
  console.error(`${method} ${path}: ${response.status}`)
  process.exit(1)
}
