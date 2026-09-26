import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { contrastRatio } from '@/lib/contrast'

// Checks the colour tokens in tokens.css against WCAG AA (PLAN §7.2).
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)')

function colours(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, value]) => [name, value]),
  )
}

const modes = {
  light: colours(css.slice(0, darkStart)),
  dark: colours(css.slice(darkStart)),
}

const surfaces = ['bg', 'surface', 'surface-sunken', 'surface-raised']
const TEXT = 4.5 // normal-size text
const NON_TEXT = 3 // focus rings, control borders, graphics

function ratio(mode: Record<string, string>, fg: string, bg: string): number {
  const a = mode[fg]
  const b = mode[bg]
  if (!a || !b) throw new Error(`Missing token --${a ? bg : fg}`)
  return contrastRatio(a, b)
}

describe.each(Object.entries(modes))('%s mode tokens', (_name, mode) => {
  it('defines a dark value for every light colour', () => {
    expect(darkStart).toBeGreaterThan(0)
    expect(Object.keys(modes.dark).sort()).toEqual(Object.keys(modes.light).sort())
  })

  it.each(['text', 'text-muted', 'accent', 'link', 'danger', 'success', 'warning'])(
    '--%s is readable text on every surface',
    (fg) => {
      for (const bg of surfaces) expect(ratio(mode, fg, bg)).toBeGreaterThanOrEqual(TEXT)
    },
  )

  it.each(['dapi', 'line-strong'])(
    '--%s is visible as a non-text element on every surface',
    (fg) => {
      for (const bg of surfaces) expect(ratio(mode, fg, bg)).toBeGreaterThanOrEqual(NON_TEXT)
    },
  )

  it('pairs text colours with their backgrounds', () => {
    expect(ratio(mode, 'on-accent', 'accent')).toBeGreaterThanOrEqual(TEXT)
    expect(ratio(mode, 'badge-text', 'badge-bg')).toBeGreaterThanOrEqual(TEXT)
  })
})
