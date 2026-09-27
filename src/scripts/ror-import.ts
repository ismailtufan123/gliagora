// Imports institutions from ROR by hand, for local development and CI:
//   pnpm ror:import                                       latest release from Zenodo (~40 MB)
//   pnpm ror:import tests/fixtures/ror/v2.13-2026-09-22-ror-data-sample.zip
//                                                         a local dump file (the CI test data)
// On the server the same import runs by itself every night (src/jobs/rorImport.ts).
import config from '@payload-config'
import path from 'node:path'
import { getPayload } from 'payload'

import { checkAndImportRor, importRorDump } from '@/jobs/rorImport'

const payload = await getPayload({ config })
const file = process.argv[2]
try {
  if (file) {
    // Dump files are named after their release, e.g. v2.13-2026-09-22-ror-data.zip.
    const match = /(v\d+(?:\.\d+)*)-(\d{4}-\d{2}-\d{2})-ror-data/.exec(path.basename(file))
    const release = { version: match?.[1] ?? 'local', date: match?.[2] ?? '' }
    await importRorDump(payload, path.resolve(file), release)
  } else {
    const result = await checkAndImportRor(payload)
    payload.logger.info(
      result.imported
        ? `Imported ROR ${result.release}`
        : `ROR ${result.release} is already imported`,
    )
  }
  process.exit(0)
} catch (error) {
  payload.logger.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
