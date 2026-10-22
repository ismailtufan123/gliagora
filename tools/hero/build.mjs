// Builds the hero's point cloud (PLAN §10.5) from the brain model, into public/hero/ and
// src/components/home/hero/hero-model.ts. See README.md: node tools/hero/build.mjs
import { createHash } from 'node:crypto'
import { readdirSync, rmSync, writeFileSync } from 'node:fs'

import { encodeHeroPoints } from './encode.mjs'
import { logoTargets, random } from './logo.mjs'
import { ASPECT, fittedModel, toScene } from './fit.mjs'
import { MODEL } from './model.mjs'
import { foldDepth, samplePoints, seenTriangles, vertexNormals } from './sample.mjs'

const POINTS = Number(process.env.POINTS ?? 19_500)

const { mesh, centre } = fittedModel()
console.log(`model: ${mesh.positions.length / 3} vertices, ${mesh.faces.length / 3} triangles`)

const normals = vertexNormals(mesh)
const depth = foldDepth(mesh)
// Only what the camera can see, in the arrival's turn and while leaning towards the pointer.
const seen = seenTriangles(mesh, {
  centre,
  turns: [-0.26, -0.13, 0, 0.08],
  tilts: [-0.05, 0, 0.05],
})
console.log(`seen: ${seen.reduce((a, b) => a + b, 0)} of ${seen.length} triangles`)
const cloud = samplePoints(mesh, normals, depth, seen, { count: POINTS, seed: 13 })
const count = cloud.shades.length
console.log(`points: ${count}`)

// Random order, so that any first part is an even sample (a lighter quality draws fewer).
const rand = random(29)
const order = Array.from({ length: count }, (_, i) => i)
for (let i = count - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1))
  ;[order[i], order[j]] = [order[j], order[i]]
}
const pick = (array, width) => order.flatMap((i) => array.slice(i * width, i * width + width))
const positions = pick(cloud.positions, 3)
const shuffled = { positions, normals: pick(cloud.normals, 3), shades: pick(cloud.shades, 1) }

// The box the positions are packed into, a little larger than the points.
const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
for (let i = 0; i < positions.length; i += 3)
  for (let k = 0; k < 3; k++) {
    box.min[k] = Math.min(box.min[k], positions[i + k])
    box.max[k] = Math.max(box.max[k], positions[i + k])
  }
for (let k = 0; k < 3; k++) {
  const pad = (box.max[k] - box.min[k]) * 0.001
  box.min[k] = +(box.min[k] - pad).toFixed(5)
  box.max[k] = +(box.max[k] + pad).toFixed(5)
}

/** The seen point nearest to a spot of the poster (viewBox units), as seen from the front. */
function nearestPoint([x, y]) {
  const [sx, sy] = toScene([x, y])
  let best = 0
  let bestScore = Infinity
  for (let i = 0; i < count; i++) {
    const n = shuffled.normals[i * 3 + 2]
    if (n < 0.2) continue
    const d =
      Math.hypot(positions[i * 3] - sx, positions[i * 3 + 1] - sy) - positions[i * 3 + 2] * 0.02
    if (d < bestScore) {
      bestScore = d
      best = i
    }
  }
  return [0, 1, 2].map((k) => +positions[best * 3 + k].toFixed(4))
}

// The wave starts at the poster's cell; each window's anchor is the brain's point nearest to its
// label's spot around the poster (global.css, from tools/poster's anchors).
const origin = nearestPoint(MODEL.cell)
const anchors = Object.fromEntries(
  Object.entries(MODEL.anchors).map(([key, spot]) => [key, nearestPoint(spot)]),
)
let reach = 0
for (let i = 0; i < count; i++)
  reach = Math.max(reach, Math.hypot(...[0, 1, 2].map((k) => positions[i * 3 + k] - origin[k])))

const logo = logoTargets()
const bytes = encodeHeroPoints(
  {
    ...shuffled,
    logo: {
      positions: logo.flatMap((p) => [p.x, p.y]),
      parts: logo.map((p) => ({ arc: 0, cell: 1, nucleus: 2 })[p.part]),
    },
  },
  box,
)
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
const folder = new URL('../../public/hero/', import.meta.url)
for (const old of readdirSync(folder).filter((name) => name.endsWith('.bin')))
  rmSync(new URL(old, folder))
const file = `brain-${hash}.bin`
writeFileSync(new URL(file, folder), bytes)

const round = (list) => list.map((value) => +value.toFixed(4))
writeFileSync(
  new URL('../../src/components/home/hero/hero-model.ts', import.meta.url),
  `// Made by tools/hero/build.mjs from ${MODEL.name} (${MODEL.licence}); do not edit by hand.
// The point file's name, the box its positions are packed into, the brain's centre, where the
// calcium wave starts (the poster's cell) and how far it runs, and each window's anchor on the
// brain (F3), in the scene's units: the poster's box is ${ASPECT} wide and 1 high, centred on 0.
import type { HeroBox } from './data'

export const HERO_MODEL: {
  file: string
  box: HeroBox
  aspect: number
  centre: [number, number, number]
  origin: [number, number, number]
  waveWidth: number
  waveReach: number
  anchors: Record<string, [number, number, number]>
} = ${JSON.stringify(
    {
      file: `/hero/${file}`,
      box,
      aspect: ASPECT,
      centre: round(centre),
      origin,
      waveWidth: 0.032,
      waveReach: +reach.toFixed(4),
      anchors,
    },
    null,
    2,
  )}
`,
)
console.log(
  `${file}: ${bytes.byteLength} bytes (PLAN §10.5: at most 150 KB), ${count} points, ${logo.length} logo points`,
)
