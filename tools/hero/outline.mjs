// The poster's outlines from the brain model (D60), so the poster (tools/poster, layer L1) and the
// 3D brain's first frame (layer L2) draw the same brain in the same place: the model as the scene's
// camera sees it at rest (project.mjs), split where one part hides another (a jump in depth) into
// the cerebrum, the cerebellum and the brainstem, each outlined. Writes tools/poster/outline.json, in
// gen.mjs's design units (the poster's viewBox halved, x less 13). node tools/hero/outline.mjs
import { writeFileSync } from 'node:fs'

import { contours, polyLength, resample, smooth } from '../poster/lib.mjs'
import { fittedModel } from './fit.mjs'
import { depthImage } from './project.mjs'

const { mesh } = fittedModel()
const { W, H, depth } = depthImage(mesh, 1)
const covered = (i) => depth[i] > -Infinity

// Where depth jumps by more than about 2.5 mm between neighbouring pixels (one part in front of
// another, or the wall of a sulcus), widened, so that a fill stops there.
const JUMP = 0.012
const WIDEN = 3
let barrier = new Uint8Array(W * H)
for (let y = 1; y < H - 1; y++)
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x
    if (!covered(i)) continue
    for (const j of [i + 1, i - 1, i + W, i - W])
      if (covered(j) && Math.abs(depth[j] - depth[i]) > JUMP) barrier[i] = 1
  }
for (let g = 0; g < WIDEN; g++) {
  const next = Uint8Array.from(barrier)
  for (let i = W; i < W * (H - 1); i++)
    if (barrier[i]) next[i + 1] = next[i - 1] = next[i + W] = next[i - W] = 1
  barrier = next
}

/** The pixels reached from a seed without crossing the barrier. */
function region(sx, sy) {
  const inside = new Uint8Array(W * H)
  const stack = [sy * W + sx]
  let count = 0
  while (stack.length) {
    const i = stack.pop()
    if (inside[i] || barrier[i] || !covered(i)) continue
    inside[i] = 1
    count++
    const x = i % W
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    if (i >= W) stack.push(i - W)
    if (i < W * (H - 1)) stack.push(i + W)
  }
  return { inside, count }
}

/** A region grown by `steps` pixels over covered pixels that `free` allows (the barrier's width back). */
function grow(mask, steps, free) {
  let m = mask
  for (let s = 0; s < steps; s++) {
    const next = Uint8Array.from(m)
    for (let i = W; i < W * (H - 1); i++)
      if (m[i]) for (const j of [i + 1, i - 1, i + W, i - W]) if (covered(j) && free(j)) next[j] = 1
    m = next
  }
  return m
}

// Seeds on the poster's grid, in the cerebellum's and the brainstem's middles (checked below: each
// fill must stay a part, not run into the cerebrum).
const cerebellum0 = region(920, 650)
const stem0 = region(815, 780)
if (
  cerebellum0.count < 15_000 ||
  cerebellum0.count > 60_000 ||
  stem0.count < 3_000 ||
  stem0.count > 15_000
)
  throw new Error(
    `Parts not found: cerebellum ${cerebellum0.count}, brainstem ${stem0.count} pixels`,
  )
const cerebellumSeen = grow(cerebellum0.inside, WIDEN + 2, (j) => !stem0.inside[j])
const stemSeen = grow(stem0.inside, WIDEN + 2, (j) => !cerebellumSeen[j])
const cerebrum = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++)
  cerebrum[i] = covered(i) && !cerebellumSeen[i] && !stemSeen[i] ? 1 : 0

/**
 * A part drawn whole although the cerebrum hides its top (the poster draws the cerebrum over it):
 * each column of the part is continued upwards by `reach` pixels under the cerebrum.
 */
function underCerebrum(part, reach) {
  const out = Uint8Array.from(part)
  for (let x = 0; x < W; x++) {
    let top = -1
    for (let y = 0; y < H; y++)
      if (part[y * W + x]) {
        top = y
        break
      }
    if (top < 0) continue
    for (let y = Math.max(0, top - reach); y < top; y++) if (cerebrum[y * W + x]) out[y * W + x] = 1
  }
  return out
}

/** The outline of a mask: the 0.5 line of the mask, blurred, as the longest closed line. */
function outline(mask) {
  const field = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) field[i] = mask[i]
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 1; x < W - 1; x++)
        tmp[y * W + x] = (field[y * W + x - 1] + field[y * W + x] + field[y * W + x + 1]) / 3
    for (let y = 1; y < H - 1; y++)
      for (let x = 0; x < W; x++)
        field[y * W + x] = (tmp[(y - 1) * W + x] + tmp[y * W + x] + tmp[(y + 1) * W + x]) / 3
  }
  const lines = contours(field, W, H, 0, 0, 1, 0.5).filter((line) => line.closed)
  const longest = lines.sort((a, b) => polyLength(b.pts, true) - polyLength(a.pts, true))[0]
  return smooth(resample(longest.pts, 3, true), true, 3)
}

const design = (pts) => pts.map(([x, y]) => [+(x / 2 - 13).toFixed(1), +(y / 2).toFixed(1)])

// The brainstem's two sides, from its hidden top to where the model ends (the cut).
const stemWhole = underCerebrum(stemSeen, 70)
const rows = []
for (let y = 0; y < H; y++) {
  let left = -1
  let right = -1
  for (let x = 0; x < W; x++)
    if (stemWhole[y * W + x]) {
      if (left < 0) left = x
      right = x
    }
  if (left >= 0) rows.push({ y, left, right: right + 1 })
}
const cut = rows.at(-1).y + 1
const side = (key) =>
  smooth(
    resample(
      rows.filter((_, i) => i % 4 === 0 || i === rows.length - 1).map((row) => [row[key], row.y]),
      6,
      false,
    ),
    false,
    2,
  )

const result = {
  made: 'tools/hero/outline.mjs, from the brain model of tools/hero/model.mjs (CC BY 4.0)',
  cerebrum: design(outline(cerebrum)),
  cerebellum: design(outline(underCerebrum(cerebellumSeen, 40))),
  stemLeft: design(side('left')),
  stemRight: design(side('right')),
  cut: +(cut / 2).toFixed(1),
  // The brainstem's width where it shows (below the cerebellum's top), in design units.
  stemWidth: +(
    rows.slice(-60).reduce((sum, row) => sum + row.right - row.left, 0) /
    Math.min(60, rows.length) /
    2
  ).toFixed(1),
}
writeFileSync(new URL('../poster/outline.json', import.meta.url), JSON.stringify(result) + '\n')
console.log(
  `outline.json: cerebrum ${result.cerebrum.length}, cerebellum ${result.cerebellum.length}, brainstem ${result.stemLeft.length} + ${result.stemRight.length} points, cut at ${result.cut}`,
)
