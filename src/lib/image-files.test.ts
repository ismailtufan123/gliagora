import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// The Docker image is built from a context without tests/ (.dockerignore), and `next build`
// type-checks every TypeScript file under src/, test files included: a file under src/ that imports
// from tests/ fails the image's build (it did, with the OIDC tests, in M4b.3). Such tests live in
// tests/ instead.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(file)
    return /\.(?:ts|tsx|mts)$/.test(entry.name) ? [file] : []
  })
}

describe('files the image is built from', () => {
  it('import nothing from tests/', () => {
    const offending = sourceFiles('src').filter((file) =>
      /(?:from|import)\s*\(?\s*['"](?:\.\.\/)+tests\//.test(readFileSync(file, 'utf8')),
    )
    expect(offending, 'move these tests to tests/').toEqual([])
  })
})
