import { existsSync } from 'node:fs'

import { inject } from 'vitest'

// Runs in each test process before the test file is loaded, so that anything that loads the
// Payload config (which reads DATABASE_URL once) connects to the scratch database, never to the
// development database named in .env. SMTP_HOST is cleared: no email is sent unless a test sets
// it (tests/integration/helpers.ts, `testPayload`); so are listmonk's settings (M2): no test talks
// to a listmonk but its own (tests/integration/listmonk.ts).
if (existsSync('.env')) process.loadEnvFile('.env')
process.env.DATABASE_URL = inject('databaseUrl')
process.env.PAYLOAD_JOBS_AUTORUN = 'false'
process.env.SMTP_HOST = ''
process.env.LISTMONK_URL = ''
process.env.LISTMONK_API_TOKEN = ''
