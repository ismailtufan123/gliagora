// Calls one of the app's operations routes from inside its container (M7, D52; src/lib/ops/auth.ts):
//
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs POST /api/ops/monitors/run < request.json
//   docker compose -f compose.prod.yml exec -T app node ops/call.mjs GET /api/ops/ai-drafts/export > export.json
//
// It derives the routes' key from PAYLOAD_SECRET, which the container has, and never prints it.
// The answer goes to standard output; the exit code is 1 when the route refused or failed.
// Plain JavaScript without dependencies: the Docker image copies this folder next to the server.
import { hkdfSync } from 'node:crypto'
import { request as httpRequest } from 'node:http'

const [method, path] = process.argv.slice(2)
if (
  !['GET', 'POST'].includes(method ?? '') ||
  !/^\/api\/ops\/[a-z0-9/-]+\/(?:\?[a-z0-9=&]+)?$/.test(path ?? '')
) {
  console.error('Usage: node ops/call.mjs GET|POST /api/ops/<route>/[?dry=1] [< body.json]')
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

// node:http rather than fetch: fetch stops waiting for the answer's headers after five minutes, and
// a run of the monitors by hand takes longer; the route answers when it is done.
const answer = await new Promise((resolve, reject) => {
  const request = httpRequest(
    {
      host: '127.0.0.1',
      port: Number(process.env.PORT ?? '3000'),
      path,
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(body === undefined ? {} : { 'Content-Length': Buffer.byteLength(body) }),
      },
    },
    (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
      )
      response.on('error', reject)
    },
  )
  request.on('error', reject)
  request.end(body)
})
process.stdout.write(answer.text)
if (answer.status < 200 || answer.status >= 300) {
  console.error(`${method} ${path}: ${answer.status}`)
  process.exit(1)
}
