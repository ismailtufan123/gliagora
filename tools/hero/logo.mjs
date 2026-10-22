// Samples the 6b mark (public/brand/gliagora-mark.svg, D12) into target points for the hero's last
// frame (PLAN §10.3, "Logo target"): the three arcs with the G's bar, and the astrocyte at their
// centre. Read from the file as it is, never redrawn: the paths' own commands (M, A, L, Q, Z) and
// circles are followed, and the points fill each stroke or shape.
import { readFileSync } from 'node:fs'

const MARK = new URL('../../public/brand/gliagora-mark.svg', import.meta.url)

/** The path's commands as [letter, ...numbers]; the mark uses absolute M, A, L, Q and Z only. */
function commands(d) {
  const out = []
  for (const [, letter, args] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    if (letter !== letter.toUpperCase()) throw new Error(`Relative command ${letter} in the mark`)
    out.push([letter, ...(args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number)])
  }
  return out
}

/** SVG's arc from its end points to its centre and angles (SVG 1.1, F.6.5), rotation 0 only. */
function arcCentre([x1, y1], [rx, ry, rotation, large, sweep, x2, y2]) {
  if (rotation !== 0 || rx !== ry) throw new Error('Only circular arcs are expected in the mark')
  const r = rx
  const mx = (x1 - x2) / 2
  const my = (y1 - y2) / 2
  const sign = large === sweep ? -1 : 1
  const factor = sign * Math.sqrt(Math.max(0, (r * r - mx * mx - my * my) / (mx * mx + my * my)))
  const cx = factor * my + (x1 + x2) / 2
  const cy = -factor * mx + (y1 + y2) / 2
  const a1 = Math.atan2(y1 - cy, x1 - cx)
  let delta = Math.atan2(y2 - cy, x2 - cx) - a1
  if (sweep && delta < 0) delta += 2 * Math.PI
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  return { cx, cy, r, a1, delta }
}

/** A path as polylines (one per subpath), each point every `step` units at most. */
function polylines(d, step) {
  const lines = []
  let line = []
  let at = [0, 0]
  for (const [letter, ...n] of commands(d)) {
    if (letter === 'M') {
      if (line.length) lines.push(line)
      at = [n[0], n[1]]
      line = [at]
    } else if (letter === 'L') {
      const to = [n[0], n[1]]
      const k = Math.max(1, Math.ceil(Math.hypot(to[0] - at[0], to[1] - at[1]) / step))
      for (let i = 1; i <= k; i++)
        line.push([at[0] + ((to[0] - at[0]) * i) / k, at[1] + ((to[1] - at[1]) * i) / k])
      at = to
    } else if (letter === 'A') {
      const { cx, cy, r, a1, delta } = arcCentre(at, n)
      const k = Math.max(2, Math.ceil(Math.abs(delta * r) / step))
      for (let i = 1; i <= k; i++) {
        const a = a1 + (delta * i) / k
        line.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
      at = [n[5], n[6]]
    } else if (letter === 'Q') {
      const [qx, qy, x, y] = n
      const k = Math.max(2, Math.ceil(Math.hypot(x - at[0], y - at[1]) / step) * 2)
      for (let i = 1; i <= k; i++) {
        const t = i / k
        const u = 1 - t
        line.push([
          u * u * at[0] + 2 * u * t * qx + t * t * x,
          u * u * at[1] + 2 * u * t * qy + t * t * y,
        ])
      }
      at = [x, y]
    } else if (letter === 'Z') {
      line.push(line[0])
      at = line[0]
    } else {
      throw new Error(`Unexpected command ${letter} in the mark`)
    }
  }
  if (line.length) lines.push(line)
  return lines
}

/** Points at even spacing along a polyline. */
function along(line, spacing) {
  const out = []
  let carry = 0
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]
    const [bx, by] = line[i]
    const length = Math.hypot(bx - ax, by - ay)
    let s = carry
    while (s < length) {
      const t = s / length
      out.push({
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        tx: (bx - ax) / length,
        ty: (by - ay) / length,
      })
      s += spacing
    }
    carry = s - length
  }
  return out
}

/** Whether a point is inside any of the closed polylines (each shape on its own, so overlaps add). */
function inside(lines, x, y) {
  return lines.some((line) => {
    let hit = false
    for (let i = 0, j = line.length - 1; i < line.length; j = i++) {
      const [xi, yi] = line[i]
      const [xj, yj] = line[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  })
}

/** A small, fixed pseudo-random sequence, so the output never changes between runs. */
export function random(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The mark's target points in its own units (viewBox 0–200, y down), each with its part: `arc`
 * (the three arcs and the bar, ink), `cell` (the astrocyte's processes, end feet and body,
 * magenta) and `nucleus` (blue). `spacing` is the distance between neighbouring points.
 */
export function logoTargets({ spacing = 1.6, seed = 6 } = {}) {
  const svg = readFileSync(MARK, 'utf8')
  const rand = random(seed)
  const points = []
  // The stroked arcs: points along the path, spread across the stroke's width.
  for (const [, width, d] of svg.matchAll(/<path stroke-width="([\d.]+)" d="([^"]+)"\/>/g)) {
    const half = Number(width) / 2
    const rows = Math.max(1, Math.round(Number(width) / spacing))
    for (const line of polylines(d, 0.5))
      for (const p of along(line, spacing))
        for (let row = 0; row < rows; row++) {
          const offset = -half + ((row + 0.5) / rows) * 2 * half + (rand() - 0.5) * 0.6
          const shift = (rand() - 0.5) * spacing * 0.5
          points.push({
            part: 'arc',
            x: p.x - p.ty * offset + p.tx * shift,
            y: p.y + p.tx * offset + p.ty * shift,
          })
        }
  }
  // The filled cell: its processes (one path of closed shapes) and circles, filled on a jittered grid.
  const cell = /<g fill="#B8286E"><path d="([^"]+)"\/>(.*?)<\/g>/s.exec(svg)
  if (!cell) throw new Error('The astrocyte is missing from the mark')
  const shapes = polylines(cell[1], 0.3)
  const circles = [...cell[2].matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>/g)].map(
    ([, cx, cy, r]) => ({ cx: Number(cx), cy: Number(cy), r: Number(r) }),
  )
  const nucleus = /<\/g>\s*<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill=/.exec(svg)
  if (!nucleus) throw new Error('The nucleus is missing from the mark')
  const [nx, ny, nr] = nucleus.slice(1).map(Number)
  const cellSpacing = spacing * 0.6
  for (let y = 70; y <= 130; y += cellSpacing)
    for (let x = 70; x <= 135; x += cellSpacing) {
      const px = x + (rand() - 0.5) * cellSpacing * 0.7
      const py = y + (rand() - 0.5) * cellSpacing * 0.7
      const inNucleus = Math.hypot(px - nx, py - ny) <= nr
      const inCell =
        inside(shapes, px, py) || circles.some((c) => Math.hypot(px - c.cx, py - c.cy) <= c.r)
      if (inNucleus) points.push({ part: 'nucleus', x: px, y: py })
      else if (inCell) points.push({ part: 'cell', x: px, y: py })
    }
  return points
}

// node tools/hero/logo.mjs: how many points each part gets.
if (import.meta.url === `file://${process.argv[1]}`) {
  const points = logoTargets()
  const parts = Object.groupBy(points, (p) => p.part)
  console.log(
    Object.entries(parts)
      .map(([part, list]) => `${part} ${list.length}`)
      .join(', '),
  )
}
