import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// Which changes run CI (D46): .github/workflows/ci.yml skips a push or pull request that touches
// only documentation (its `paths` lists), and deploy.yml's `documentation_only` repeats that rule
// for a release tag on such a commit. Both must agree, and the app's own Markdown must run CI.

const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8')

/** The `paths` list under one event of ci.yml's `on:`. */
function pathsOf(event: 'pull_request' | 'push'): string[] {
  const block = new RegExp(
    `\\n  ${event}:\\n(?:    .*\\n)*?    paths:\\n((?:      - .*\\n)+)`,
  ).exec(ci)
  if (!block?.[1]) throw new Error(`ci.yml has no paths list for ${event}`)
  return [...block[1].matchAll(/- '([^']+)'/g)].map((match) => match[1] as string)
}

/** GitHub's filter patterns: `**` matches anything, `*` anything but a slash. */
function globToRegExp(glob: string): RegExp {
  const source = glob
    .split(/(\*\*|\*)/)
    .map((part) =>
      part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('')
  return new RegExp(`^${source}$`)
}

/** Whether a changed file makes CI run: the last pattern that matches it decides. */
function runsCi(patterns: string[], file: string): boolean {
  let included = false
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!')
    if (globToRegExp(negated ? pattern.slice(1) : pattern).test(file)) included = !negated
  }
  return included
}

/** deploy.yml's `documentation_only`, run by bash for one file. */
function deployCallsDocumentation(file: string): boolean {
  const fn = /( {10}documentation_only\(\) \{\n[\s\S]*?\n {10}\})/.exec(deploy)?.[1]
  if (!fn) throw new Error('deploy.yml has no documentation_only function')
  try {
    execFileSync('bash', ['-c', `${fn}\ndocumentation_only "$1"`, 'check', file])
    return true
  } catch {
    return false
  }
}

const FILES = {
  documentation: [
    'README.md',
    'PLAN.md',
    'CLAUDE.md',
    'docs/STATUS.md',
    'docs/NEXT.md',
    'docs/legal/veri-isleme-sozlesmesi-taslak.md',
    'deploy/README.md',
    'tools/poster/README.md',
  ],
  // Read by the app or by a test, so a change to them runs CI.
  code: [
    'content/en/about.md',
    'content/tr/legal/kvkk-aydinlatma-metni.md',
    'docs/editor-guide-tr.md',
    'docs/tr-strings-review.md',
    'src/lib/site.ts',
    'messages/en.json',
    '.github/workflows/ci.yml',
    'deploy/Caddyfile',
    'package.json',
  ],
}

describe('CI path filter (D46)', () => {
  it('is the same for pull requests and pushes to main', () => {
    expect(pathsOf('push')).toEqual(pathsOf('pull_request'))
  })

  it('skips documentation and runs for everything the app or a test reads', () => {
    const patterns = pathsOf('pull_request')
    for (const file of FILES.documentation) expect(runsCi(patterns, file), file).toBe(false)
    for (const file of FILES.code) expect(runsCi(patterns, file), file).toBe(true)
  })

  it('agrees with the deploy workflow on what is only documentation', () => {
    for (const file of [...FILES.documentation, ...FILES.code]) {
      expect(deployCallsDocumentation(file), file).toBe(FILES.documentation.includes(file))
    }
  })
})
