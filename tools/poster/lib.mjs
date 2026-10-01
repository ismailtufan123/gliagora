// ---------- helpers ----------
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// Catmull-Rom (centripetal-ish via uniform) sampled densely.
export function spline(pts, closed, n = 16) {
  const out = []
  const N = pts.length
  const get = (i) => (closed ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))])
  const segs = closed ? N : N - 1
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1),
      p1 = get(i),
      p2 = get(i + 1),
      p3 = get(i + 2)
    for (let k = 0; k < n; k++) {
      const t = k / n,
        t2 = t * t,
        t3 = t2 * t
      out.push(
        [0, 1].map(
          (d) =>
            0.5 *
            (2 * p1[d] +
              (-p0[d] + p2[d]) * t +
              (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 +
              (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3),
        ),
      )
    }
  }
  if (!closed) out.push(pts[N - 1])
  return out
}

export function polyLength(p, closed) {
  let L = 0
  for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i])
  if (closed) L += dist(p[p.length - 1], p[0])
  return L
}

// Resample a polyline at (roughly) even spacing.
export function resample(p, step, closed) {
  const pts = closed ? [...p, p[0]] : p
  const L = polyLength(pts, false)
  const n = Math.max(2, Math.round(L / step))
  const s = L / n
  const out = [pts[0]]
  let i = 1
  const cum = [0]
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + dist(pts[k - 1], pts[k]))
  for (let m = 1; m < n; m++) {
    const t = m * s
    while (i < pts.length - 1 && cum[i] < t) i++
    const a = pts[i - 1],
      b = pts[i]
    const f = (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
  }
  if (!closed) out.push(pts[pts.length - 1])
  return out
}

// Laplacian smoothing (keeps ends of open lines).
export function smooth(p, closed, iters = 2, k = 0.5) {
  // Taubin smoothing: alternate shrink and inflate steps so closed curves keep their size.
  let q = p
  for (let it = 0; it < iters * 2; it++) {
    const f = it % 2 ? -0.53 : k
    q = q.map((pt, i) => {
      if (!closed && (i === 0 || i === q.length - 1)) return pt
      const a = q[(i - 1 + q.length) % q.length],
        b = q[(i + 1) % q.length]
      return [pt[0] + f * ((a[0] + b[0]) / 2 - pt[0]), pt[1] + f * ((a[1] + b[1]) / 2 - pt[1])]
    })
  }
  return q
}

export function segDist(p, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy || 1
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
export function polyDist(p, poly, closed) {
  let m = Infinity
  const n = poly.length
  for (let i = 0; i < (closed ? n : n - 1); i++)
    m = Math.min(m, segDist(p, poly[i], poly[(i + 1) % n]))
  return m
}
export function inside(p, poly) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
export const sdf = (p, poly) => (inside(p, poly) ? 1 : -1) * polyDist(p, poly, true)

// Marching squares over a field sampled on a grid.
export function contours(field, nx, ny, x0, y0, step, level) {
  const v = (i, j) => field[j * nx + i] - level
  const segs = []
  const pt = (i, j, edge) => {
    // edge: 'h' between (i,j)-(i+1,j), 'v' between (i,j)-(i,j+1)
    const a = v(i, j)
    const b = edge === 'h' ? v(i + 1, j) : v(i, j + 1)
    const t = a / (a - b)
    return {
      key: `${edge}${i},${j}`,
      p: edge === 'h' ? [x0 + (i + t) * step, y0 + j * step] : [x0 + i * step, y0 + (j + t) * step],
    }
  }
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = v(i, j) > 0,
        b = v(i + 1, j) > 0,
        c = v(i + 1, j + 1) > 0,
        d = v(i, j + 1) > 0
      const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0)
      if (code === 0 || code === 15) continue
      const T = () => pt(i, j, 'h'),
        R = () => pt(i + 1, j, 'v'),
        B = () => pt(i, j + 1, 'h'),
        L = () => pt(i, j, 'v')
      const center = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 > 0
      const map = {
        1: [[L, B]],
        2: [[B, R]],
        3: [[L, R]],
        4: [[T, R]],
        6: [[T, B]],
        7: [[L, T]],
        8: [[L, T]],
        9: [[T, B]],
        11: [[T, R]],
        12: [[L, R]],
        13: [[B, R]],
        14: [[L, B]],
        5: center
          ? [
              [L, T],
              [B, R],
            ]
          : [
              [L, B],
              [T, R],
            ],
        10: center
          ? [
              [L, B],
              [T, R],
            ]
          : [
              [L, T],
              [B, R],
            ],
      }
      for (const [f, g] of map[code]) segs.push([f(), g()])
    }
  // chain
  const adj = new Map()
  const add = (k, s) => (adj.has(k) ? adj.get(k).push(s) : adj.set(k, [s]))
  segs.forEach((s, idx) => {
    add(s[0].key, idx)
    add(s[1].key, idx)
  })
  const used = new Array(segs.length).fill(false)
  const lines = []
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue
    used[s0] = true
    const chain = [segs[s0][0], segs[s0][1]]
    // extend forward
    for (const dir of [1, -1]) {
      for (;;) {
        const end = dir === 1 ? chain[chain.length - 1] : chain[0]
        const next = (adj.get(end.key) || []).find((x) => !used[x])
        if (next === undefined) break
        used[next] = true
        const s = segs[next]
        const other = s[0].key === end.key ? s[1] : s[0]
        if (dir === 1) chain.push(other)
        else chain.unshift(other)
      }
    }
    const closed = chain[0].key === chain[chain.length - 1].key
    const pts = chain.map((c) => c.p)
    if (closed) pts.pop()
    lines.push({ pts, closed })
  }
  return lines
}

// Path data: Catmull-Rom through points as cubic beziers with S shorthand, relative, rounded.
export let PREC = 1
export const setPrec = (p) => {
  PREC = p
}
export const r = (x) => {
  const v = Math.round(x * 10 ** PREC) / 10 ** PREC
  return v
}
export function num(x) {
  let s = String(r(x))
  if (s.startsWith('0.')) s = s.slice(1)
  else if (s.startsWith('-0.')) s = '-' + s.slice(2)
  return s
}
export function nums(arr) {
  let out = ''
  let prev = null
  for (const x of arr) {
    const s = num(x)
    if (prev === null || s.startsWith('-') || (s.startsWith('.') && prev.includes('.'))) out += s
    else out += ' ' + s
    prev = s
  }
  return out
}
export function pathData(ptsIn, closed) {
  const pts = ptsIn.map((p) => [r(p[0]), r(p[1])])
  const N = pts.length
  const get = (i) => (closed ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))])
  let d = 'M' + nums(pts[0])
  let cur = pts[0]
  const segs = closed ? N : N - 1
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1),
      p1 = get(i),
      p2 = get(i + 1),
      p3 = get(i + 2)
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [r(p2[0] - (p3[0] - p1[0]) / 6), r(p2[1] - (p3[1] - p1[1]) / 6)]
    if (i === 0)
      d +=
        'c' +
        nums([
          r(c1[0]) - cur[0],
          r(c1[1]) - cur[1],
          c2[0] - cur[0],
          c2[1] - cur[1],
          p2[0] - cur[0],
          p2[1] - cur[1],
        ])
    else d += 's' + nums([c2[0] - cur[0], c2[1] - cur[1], p2[0] - cur[0], p2[1] - cur[1]])
    cur = p2
  }
  if (closed) d += 'z'
  return d
}
