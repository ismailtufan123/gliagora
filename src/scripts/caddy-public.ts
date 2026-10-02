// Writes deploy/caddy/m2-public.caddy, what the M2 state opens without the site-wide password
// (D41, D50): pnpm caddy:public. Run it after a change to src/lib/public-pages.ts or to the
// approval of a legal text (draft: false in src/lib/content.ts); a unit test fails until then.
// Running it again changes nothing.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { CADDY_PUBLIC_FILE, CADDY_PUBLIC_PATH, m2PublicCaddy } from './caddy-public-file'

const text = m2PublicCaddy()
const previous = await readFile(CADDY_PUBLIC_FILE, 'utf8').catch(() => null)
if (text === previous) {
  console.log(`${CADDY_PUBLIC_PATH} is up to date.`)
} else {
  await mkdir(path.dirname(CADDY_PUBLIC_FILE), { recursive: true })
  await writeFile(CADDY_PUBLIC_FILE, text)
  console.log(
    `Wrote ${CADDY_PUBLIC_PATH}. Copy it to the server as deploy/README.md says ("Switching to the M2 state").`,
  )
}
