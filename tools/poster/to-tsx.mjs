// Writes src/components/home/HomePoster.tsx from poster.svg (made by gen.mjs): the gradient stops'
// colours become classes (styled in global.css), and the attributes get React's names. Then run
// `pnpm format`.
import { readFileSync, writeFileSync } from 'node:fs'

const STOPS = {
  'stop-color:var(--accent)': 'poster-stop-accent',
  'stop-color:var(--dapi)': 'poster-stop-dapi',
  'stop-color:var(--surface);stop-opacity:0': 'poster-stop-surface-clear',
  'stop-color:var(--surface)': 'poster-stop-surface',
}

let svg = readFileSync(new URL('poster.svg', import.meta.url), 'utf8').trim()
for (const [style, name] of Object.entries(STOPS)) {
  svg = svg.replaceAll(`style="${style}"`, `class="${name}"`)
}
if (svg.includes('style=') || svg.includes('<style'))
  throw new Error('Unexpected style in poster.svg')

const camel = (name) =>
  name === 'class'
    ? 'className'
    : name.startsWith('aria-') || name.includes(':')
      ? name
      : name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
const jsx = svg.replace(/([a-zA-Z:-]+)="([^"]*)"/g, (_, name, value) => `${camel(name)}="${value}"`)

const header = `// The hero's static poster (PLAN §10, layer L1): a brain seen from the side, its folds drawn as
// contours of its outline (like the logo's arcs), with one calcium wave running across the cortex
// from a cell, magenta to DAPI blue. Decorative; the windows' links sit around it (HomeHero).
// Colours, the wave's one draw-in and the forced-colours and print rules are in global.css
// (\`.poster-art\`). Made by tools/poster (gen.mjs, then to-tsx.mjs); do not edit by hand.
// ${Buffer.byteLength(svg)} bytes (PLAN §10.1: at most 15 KB). One per page: its gradients have fixed ids.
`
writeFileSync(
  new URL('../../src/components/home/HomePoster.tsx', import.meta.url),
  `${header}\nexport function HomePoster() {\n  return (\n    ${jsx}\n  )\n}\n`,
)
