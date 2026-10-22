// Generates poster.svg (contour-line brain with one calcium wave) and anchors.json.
// node gen.mjs [debug]   (debug also writes debug.svg with the levels in colour)
// Design units: 680 × 500, frontal pole on the left; output at 2× (viewBox 1360 × 1000).
import { readFileSync, writeFileSync } from 'node:fs'
import {
  spline,
  polyLength,
  resample,
  smooth,
  polyDist,
  sdf,
  contours,
  pathData,
  dist,
  setPrec,
} from './lib.mjs'

const DEBUG = process.argv[2] === 'debug'
const STYLE = process.env.STYLE // path of a CSS file to inline (for renders only)
const W = 680
const OX = 13
const H = 500
setPrec(+(process.env.PREC ?? 0))

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
const clamp01 = (t) => Math.min(1, Math.max(0, t))

// Field sampled on a grid: base(p, signed distance to shape).
function field(shape, box, step, base) {
  const [x0, y0, x1, y1] = box
  const nx = Math.floor((x1 - x0) / step) + 1
  const ny = Math.floor((y1 - y0) / step) + 1
  const f = new Float64Array(nx * ny)
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const p = [x0 + i * step, y0 + j * step]
      f[j * nx + i] = base(p, sdf(p, shape))
    }
  return { f, nx, ny, x0, y0, step }
}
function levelLines(F, levels, minLen, sm) {
  const out = []
  levels.forEach((L, li) => {
    for (const line of contours(F.f, F.nx, F.ny, F.x0, F.y0, F.step, L)) {
      if (polyLength(line.pts, line.closed) < minLen(L)) continue
      out.push({
        L,
        li,
        pts: smooth(resample(line.pts, 4, line.closed), line.closed, sm(L)),
        closed: line.closed,
      })
    }
  })
  return out
}
// Split a line into the runs of points that satisfy keep(); run ends are interpolated onto the boundary
// of keep (by bisection on the segment), so lines clipped by one curve all end exactly on it.
function clip(line, keep) {
  const { pts, closed } = line
  const ok = pts.map(keep)
  if (ok.every(Boolean)) return [line]
  const edge = (a, b) => {
    // a kept, b not
    let lo = 0,
      hi = 1
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2
      if (keep([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m])) lo = m
      else hi = m
    }
    return [a[0] + (b[0] - a[0]) * lo, a[1] + (b[1] - a[1]) * lo]
  }
  const runs = []
  const n = pts.length
  const start = closed ? ok.findIndex((v) => !v) : -1
  let cur = []
  let prev = closed ? start : -1
  for (let k = 1; k <= n; k++) {
    const i = closed ? (start + k) % n : k - 1
    if (ok[i]) {
      if (!cur.length && prev >= 0 && !ok[prev]) cur.push(edge(pts[i], pts[prev]))
      cur.push(pts[i])
    } else if (cur.length) {
      cur.push(edge(pts[prev], pts[i]))
      runs.push(cur)
      cur = []
    }
    prev = i
  }
  if (cur.length) runs.push(cur)
  return runs
    .filter((r) => r.length > 2 && polyLength(r, false) > 6)
    .map((r) => ({ ...line, pts: r, closed: false }))
}
const nearest = (pts, q) =>
  pts.reduce((best, p, i) => (dist(p, q) < dist(pts[best], q) ? i : best), 0)
// Keep the part of an open line above y = cut (the line runs downward), ending exactly on the cut.
function cutAt(pts, cut) {
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (p[1] <= cut) {
      out.push(p)
      continue
    }
    const a = pts[i - 1],
      t = (cut - a[1]) / (p[1] - a[1])
    out.push([a[0] + t * (p[0] - a[0]), cut])
    break
  }
  return out
}
// Offset an open polyline by d along its left normal (positive d = to the left when walking it).
function offset(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)]
    const tx = b[0] - a[0],
      ty = b[1] - a[1],
      n = Math.hypot(tx, ty) || 1
    return [p[0] + (ty / n) * d, p[1] - (tx / n) * d]
  })
}

// ---------- the outlines: from the brain model (tools/hero/outline.mjs, D60) ----------
// The cerebrum, the cerebellum and the brainstem as the 3D brain's camera sees them at rest, so the
// poster and the 3D layer draw the same brain in the same place. Control points along each outline,
// for the same Catmull-Rom curves as before.
const OUTLINE = JSON.parse(readFileSync(new URL('outline.json', import.meta.url), 'utf8'))
const controls = (pts, count, closed) => resample(pts, polyLength(pts, closed) / count, closed)

// ---------- the cerebrum ----------
const cerebrumCtl = controls(OUTLINE.cerebrum, +(process.env.CTL ?? 30), true)
const cerebrum = spline(cerebrumCtl, true, 20)
const sylvianCtl = process.env.SYL
  ? JSON.parse(process.env.SYL)
  : [
      [225, 257],
      [262, 239],
      [312, 224],
      [360, 210],
      [394, 198],
      [414, 188],
    ]
const sylvian = spline(sylvianCtl, false, 12)
const SYL_END = sylvianCtl[sylvianCtl.length - 1]
// Lines that divide the cerebrum into lobes and gyri; the contours keep their distance from each line
// only above an offset c, so the outer contours (the cortex band) pass over them.
const dividers = [
  {
    ctl: [
      [358, 40],
      [348, 96],
      [332, 146],
      [312, 204],
    ],
    c: 27,
  }, // central sulcus
  {
    ctl: [
      [284, 132],
      [240, 140],
      [190, 150],
    ],
    c: 40,
  }, // superior frontal sulcus
  ...(process.env.DIV2 ? JSON.parse(process.env.DIV2) : []),
].map((v) => ({ ...v, poly: spline(v.ctl, false, 12).filter((p) => sdf(p, cerebrum) >= 40) }))
// The base field: distance to the outline and to the lateral fissure. Around the fissure's posterior end the
// distance grows a little more slowly, so the contours turn round it in a wider curve.
const sylDist = (p) => {
  const d = polyDist(p, sylvian, false)
  const e = dist(p, SYL_END)
  return Math.min(d, e - 5 * clamp01(1 - e / 40))
}
const baseField = (p, s) => smin(s, sylDist(p), 8)
// Ridges raise the field along a gyrus, so its inner contours run along it as one calm loop.
const ridges = (
  process.env.RIDGES
    ? JSON.parse(process.env.RIDGES)
    : [
        {
          ctl: [
            [392, 108],
            [436, 114],
            [472, 132],
            [494, 158],
          ],
          h: 14,
          w: 16,
        }, // superior parietal lobule, on to the occipital lobe
      ]
).map((r) => ({ ...r, poly: spline(r.ctl, false, 12) }))
const CF = field(cerebrum, [100, 44, 550, 336], 2, (p, s) => {
  let f = baseField(p, s)
  for (const d of dividers) f = smin(f, polyDist(p, d.poly, false) + d.c, 16)
  const k = clamp01((f - 37) / 8),
    g = k * k * (3 - 2 * k)
  for (const r of ridges) {
    const d = polyDist(p, r.poly, false)
    f += g * r.h * Math.exp(-((d / r.w) ** 2))
  }
  return f
})
const LEVELS = [11, 23, 36, 48, 60]
const CS_MIN = +(process.env.CS ?? 0) // > 0: draw the central sulcus where the base field is at least this
const centralSulcus = CS_MIN
  ? clip(
      { pts: spline(dividers[0].ctl, false, 12), closed: false },
      (p) => baseField(p, sdf(p, cerebrum)) >= CS_MIN,
    )
  : []
const SM = process.env.SM ? JSON.parse(process.env.SM) : [16, 50, 120]
const cerebrumLines = levelLines(
  CF,
  LEVELS,
  (L) => (L > 40 ? 120 : 60),
  (L) => (L > 40 ? SM[2] : L > 30 ? SM[1] : SM[0]),
)

// The calcium wave: part of the second contour, from the frontal pole over the vertex to the occipital pole.
const WAVE_LEVEL = 23
const loop = cerebrumLines
  .filter((l) => l.L === WAVE_LEVEL && l.closed)
  .sort((a, b) => polyLength(b.pts) - polyLength(a.pts))[0]
let wave
{
  const pts = loop.pts
  const a = nearest(pts, [138, 226]),
    b = nearest(pts, [522, 196])
  const n = pts.length
  const walk = (from, to, dir) => {
    const o = []
    for (let i = from; ; i = (i + dir + n) % n) {
      o.push(pts[i])
      if (i === to) break
    }
    return o
  }
  const fwd = walk(a, b, 1),
    back = walk(a, b, -1)
  const top = (r) => Math.min(...r.map((p) => p[1]))
  wave = top(fwd) < top(back) ? fwd : back
}

// ---------- the cerebellum: an outline and folia, concentric arcs like the logo's ----------
const cbCtl = controls(OUTLINE.cerebellum, 16, true)
const cb = spline(cbCtl, true, 16)
const FOLIA_C = process.env.FC ? JSON.parse(process.env.FC) : [446, 176]
const FOLIA_R = process.env.FR ? JSON.parse(process.env.FR) : [112, 124, 136, 148, 160]
const underCerebrum = (p) => sdf(p, cerebrum) > 6 // hidden by the cerebrum's fill
const folia = FOLIA_R.flatMap((R) => {
  const arc = []
  for (let a = 20; a <= 160; a += 2)
    arc.push([
      FOLIA_C[0] + R * Math.cos((a * Math.PI) / 180),
      FOLIA_C[1] + R * Math.sin((a * Math.PI) / 180),
    ])
  return clip({ pts: arc, closed: false }, (p) => sdf(p, cb) > 9 && !underCerebrum(p))
})

// ---------- the brainstem: pons bulge, medulla tilted slightly back, cut across ----------
// A level cut a little above the model's own (slanted) end, where the stem's fill fades out.
const CUT = OUTLINE.cut - 6
const stemL = spline(controls(OUTLINE.stemLeft, 7, false), false, 12)
const stemR = spline(controls(OUTLINE.stemRight, 7, false), false, 12)
const stemLeft = cutAt(stemL, CUT),
  stemRight = cutAt(stemR, CUT)
const stemInner = cutAt(offset(stemL, OUTLINE.stemWidth * 0.3), CUT).filter(
  (p) => !underCerebrum(p) && sdf(p, cb) < -6,
)

// ---------- output ----------
const K = 2
const T = ([x, y]) => [(x + OX) * K, y * K]
// Path data. Long smooth lines (the outline, the outer contours, the wave) keep one decimal, so they stay smooth when
// large; the inner folds use whole numbers.
const FINE = +(process.env.FINE ?? 1)
const P = (l, step = 15, prec = 0) => {
  setPrec(prec)
  const d = pathData(resample(l.pts, step, l.closed).map(T), l.closed)
  setPrec(0)
  return d
}
// Outlines straight from their control points: the same Catmull-Rom curves, exact and short.
const C = (ctl, closed) => pathData(ctl.map(T), closed)
const PF = (l, step = +(process.env.FSTEP ?? 22)) => P(l, step, FINE)
const wx = [Math.min(...wave.map((p) => p[0])), Math.max(...wave.map((p) => p[0]))].map((x) =>
  Math.round((x + OX) * K),
)
// Label anchors: the outline point nearest each target, pushed 9 units outward along the normal.
const outline = [...cerebrum, ...cb.filter((p) => sdf(p, cerebrum) < -1)]
const anchorAt = (q, side) => {
  const p = outline[nearest(outline, q)]
  const e = 1,
    f = (x) => Math.max(sdf(x, cerebrum), sdf(x, cb))
  const gx = f([p[0] + e, p[1]]) - f([p[0] - e, p[1]]),
    gy = f([p[0], p[1] + e]) - f([p[0], p[1] - e])
  const n = Math.hypot(gx, gy) || 1
  return { x: Math.round(p[0] - (gx / n) * 9), y: Math.round(p[1] - (gy / n) * 9), side }
}
const anchors = {
  jobs: anchorAt([160, 70], 'end'),
  events: anchorAt([480, 70], 'start'),
  funding: anchorAt([560, 200], 'start'),
  papers: anchorAt([520, 350], 'start'),
  news: anchorAt([228, 320], 'end'),
  resources: anchorAt([90, 200], 'end'),
}
for (const a of Object.values(anchors)) {
  a.x = (a.x + OX) * K
  a.y *= K
}

const detail = (l) => l.L >= 48
const w0 = T(wave[0]).map(Math.round)
const w1 = T(wave[wave.length - 1]).map(Math.round)

const out = []
out.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * K} ${H * K}" aria-hidden="true" focusable="false" class="poster-art">`,
)
if (STYLE) out.push(`<style>${(await import('node:fs')).readFileSync(STYLE, 'utf8')}</style>`)
out.push(
  `<linearGradient id="poster-wave-gradient" gradientUnits="userSpaceOnUse" x1="${wx[0]}" x2="${wx[1]}" y1="0" y2="0">` +
    `<stop offset=".4" style="stop-color:var(--accent)"/><stop offset=".78" style="stop-color:var(--dapi)"/></linearGradient>`,
)
// the brainstem's fill fades out above the cut, so the cut shows only where its lines end
out.push(
  `<linearGradient id="poster-stem-gradient" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${(CUT - 44) * K}" y2="${CUT * K}">` +
    `<stop offset="0" style="stop-color:var(--surface)"/><stop offset="1" style="stop-color:var(--surface);stop-opacity:0"/></linearGradient>`,
)
// brainstem first: the cerebellum and the cerebrum cover its top
const stemShape = { pts: [...[...stemLeft].reverse(), ...stemRight], closed: false } // open along the cut
out.push(`<path class="poster-brain poster-stem" d="${P(stemShape, 13)}"/>`)
out.push(`<path class="poster-folds" d="${P({ pts: stemInner, closed: false }, 13)}"/>`)
out.push(`<path class="poster-brain" d="${C(cbCtl, true)}"/>`)
out.push(`<path class="poster-folds" d="${folia.map((l) => P(l)).join('')}"/>`)
out.push(`<path class="poster-brain" d="${C(cerebrumCtl, true)}"/>`)
// the lateral fissure, in its own path: its fill (surface on surface) never makes a hole in the cerebrum's
out.push(`<path class="poster-brain" d="${C(sylvianCtl, false)}"/>`)
out.push(
  `<path class="poster-folds" d="${[...cerebrumLines.filter((l) => !detail(l)), ...centralSulcus].map((l) => (l.L <= 23 ? PF(l) : P(l))).join('')}"/>`,
)
out.push(
  `<path class="poster-folds poster-detail" d="${cerebrumLines
    .filter(detail)
    .map((l) => P(l))
    .join('')}"/>`,
)
out.push(`<path class="poster-wave" pathLength="1" d="${PF({ pts: wave, closed: false })}"/>`)
// a soft glow at the wave's front (faded in when the draw-in ends)
out.push(`<circle class="poster-head" cx="${w1[0]}" cy="${w1[1]}" r="18"/>`)
// the cell that starts the wave: a magenta body with a blue nucleus (fill and stroke of one circle), as in the mark
out.push(`<circle class="poster-cell" cx="${w0[0]}" cy="${w0[1]}" r="7"/>`)
if (DEBUG) {
  for (const [x, y] of cerebrumCtl)
    out.push(`<circle cx="${T([x, y])[0]}" cy="${y * K}" r="5" fill="red"/>`)
  for (const v of dividers)
    out.push(
      `<path d="${pathData(v.ctl.map(T), false)}" stroke="orange" stroke-width="2" fill="none"/>`,
    )
  for (const [x, y] of cbCtl)
    out.push(`<circle cx="${T([x, y])[0]}" cy="${y * K}" r="4" fill="green"/>`)
  const cols = { 11: 'red', 23: 'orange', 36: 'green', 48: 'blue', 60: 'purple' }
  for (const l of cerebrumLines)
    out.push(`<path d="${P(l)}" stroke="${cols[l.L]}" stroke-width="3" fill="none" opacity=".6"/>`)
}
out.push('</svg>')
const svg = out.join('')
const name = process.env.OUT ?? (DEBUG ? 'debug.svg' : STYLE ? 'styled.svg' : 'poster.svg')
writeFileSync(new URL(name, import.meta.url), svg)
if (!DEBUG && !STYLE)
  writeFileSync(new URL('anchors.json', import.meta.url), JSON.stringify(anchors, null, 2) + '\n')
console.log(name, 'bytes', Buffer.byteLength(svg))
