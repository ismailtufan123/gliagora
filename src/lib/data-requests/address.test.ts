import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { requestAddressHash } from './address'

// The command in deploy/README.md ("Finding a data request from an address") that the technical
// administrator runs in the app's container to find an unconfirmed request: it must give the same
// code as the site, from the address typed on standard input and PAYLOAD_SECRET.

const README = readFileSync(path.join(process.cwd(), 'deploy/README.md'), 'utf8')
const COMMAND = /^docker compose -f compose\.prod\.yml exec -T app node -e '([^']+)'$/m

describe('the address code command in deploy/README.md', () => {
  it('reads the address from standard input and gives the code the site stores', () => {
    const script = COMMAND.exec(README)?.[1]
    expect(script, 'the command in deploy/README.md').toBeTruthy()
    // Only Node's own modules: the container's node runs it, outside the app.
    expect(script).not.toMatch(/require\("(?!node:crypto")/)
    for (const typed of ['Someone.Else@Example.ORG\n', '  someone+news@example.org  \n']) {
      const secret = 'test-only-payload-secret'
      const run = spawnSync(process.execPath, ['-e', script!], {
        input: typed,
        env: { NODE_ENV: 'test', PATH: process.env.PATH, PAYLOAD_SECRET: secret },
        encoding: 'utf8',
      })
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout.trim()).toBe(requestAddressHash(typed, secret))
    }
  })
})
