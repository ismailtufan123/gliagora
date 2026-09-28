// Adds the editor account the end-to-end tests sign in with, for local development and CI only:
//   E2E_EDITOR_PASSWORD=… pnpm e2e:editor
// The address is fixed (src/scripts/e2e-editor-account.ts); the password is whatever
// E2E_EDITOR_PASSWORD holds, and must be passed to `pnpm test:e2e` too. Running it again sets the
// password again and lifts a lock after failed sign-ins, so it can run at any time.
import config from '@payload-config'
import { getPayload } from 'payload'

import { E2E_EDITOR_EMAIL } from './e2e-editor-account'

// PAYLOAD_JOBS_AUTORUN is "true" only on the production server (deploy/compose.prod.yml).
if (process.env.PAYLOAD_JOBS_AUTORUN === 'true') {
  console.error(
    'pnpm e2e:editor adds a test account for local development and CI only. It does not run where PAYLOAD_JOBS_AUTORUN is "true", which marks the production server.',
  )
  process.exit(1)
}

const password = process.env.E2E_EDITOR_PASSWORD
if (!password) {
  console.error('Set E2E_EDITOR_PASSWORD to the password the end-to-end tests will sign in with.')
  process.exit(1)
}

const payload = await getPayload({ config })

try {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: E2E_EDITOR_EMAIL } },
    limit: 1,
    depth: 0,
  })
  const existing = docs[0]
  if (existing) {
    await payload.update({ collection: 'users', id: existing.id, data: { password }, depth: 0 })
    // Lifts a lock after failed sign-ins (the password is only there to satisfy the type).
    await payload.unlock({
      collection: 'users',
      data: { email: E2E_EDITOR_EMAIL, password },
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'users',
      data: { email: E2E_EDITOR_EMAIL, password },
      depth: 0,
    })
  }
  payload.logger.info(`${existing ? 'Updated' : 'Added'} the test editor ${E2E_EDITOR_EMAIL}`)
  process.exit(0)
} catch (error) {
  payload.logger.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
