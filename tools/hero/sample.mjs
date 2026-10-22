// Mesh helpers for the hero's point cloud (tools/hero/build.mjs): normals, the folds' depth, which
// triangles the camera sees, and an even sample of points on the seen surface. Plain arrays: a
// mesh is { positions: Float64Array (x, y, z per vertex), faces: Uint32Array (3 per triangle) }.

import { random } from './logo.mjs'

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const vertex = (positions, i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]

/** Area-weighted vertex normals, of unit length. */
export function vertexNormals({ positions, faces }) {
  const normals = new Float64Array(positions.length)
  for (let f = 0; f < faces.length; f += 3) {
    const [a, b, c] = [faces[f], faces[f + 1], faces[f + 2]]
    const n = cross(
      sub(vertex(positions, b), vertex(positions, a)),
      sub(vertex(positions, c), vertex(positions, a)),
    )
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normals[v * 3 + k] += n[k]
  }
  // Outwards: most normals point away from the mesh's centre of mass (a closed surface's would
  // all point in, should its triangles turn the other way).
  const centre = [0, 1, 2].map((k) => {
    let sum = 0
    for (let v = k; v < positions.length; v += 3) sum += positions[v]
    return sum / (positions.length / 3)
  })
  let outwards = 0
  for (let v = 0; v < normals.length; v += 3)
    outwards += Math.sign(
      (positions[v] - centre[0]) * normals[v] +
        (positions[v + 1] - centre[1]) * normals[v + 1] +
        (positions[v + 2] - centre[2]) * normals[v + 2],
    )
  const sign = outwards < 0 ? -1 : 1
  for (let v = 0; v < normals.length; v += 3) {
    const length = (Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1) * sign
    for (let k = 0; k < 3; k++) normals[v + k] /= length
  }
  return normals
}

/** Each vertex's neighbours (by the mesh's edges). */
function neighbours({ positions, faces }) {
  const sets = Array.from({ length: positions.length / 3 }, () => new Set())
  for (let f = 0; f < faces.length; f += 3)
    for (let k = 0; k < 3; k++) {
      const a = faces[f + k]
      const b = faces[f + ((k + 1) % 3)]
      sets[a].add(b)
      sets[b].add(a)
    }
  return sets.map((set) => Uint32Array.from(set))
}

/**
 * How deep each vertex lies in a fold: the mesh is smoothed until its folds are gone (a surface
 * like an inflated brain's), and each vertex's distance outside (+) or inside (−) that smooth
 * surface is its depth, as in sulcal depth maps. Returned as 0 (deepest) to 1 (a crown), from the
 * 2nd to the 98th percentile.
 */
export function foldDepth(mesh, { iterations = 80, lambda = 0.6 } = {}) {
  const near = neighbours(mesh)
  let smooth = Float64Array.from(mesh.positions)
  let next = new Float64Array(smooth.length)
  for (let it = 0; it < iterations; it++) {
    for (let v = 0; v < near.length; v++) {
      const list = near[v]
      let x = 0
      let y = 0
      let z = 0
      for (const u of list) {
        x += smooth[u * 3]
        y += smooth[u * 3 + 1]
        z += smooth[u * 3 + 2]
      }
      const n = list.length || 1
      for (const [k, mean] of [x / n, y / n, z / n].entries())
        next[v * 3 + k] = smooth[v * 3 + k] + lambda * (mean - smooth[v * 3 + k])
    }
    ;[smooth, next] = [next, smooth]
  }
  const smoothNormals = vertexNormals({ positions: smooth, faces: mesh.faces })
  const depth = new Float64Array(near.length)
  for (let v = 0; v < near.length; v++) {
    let d = 0
    for (let k = 0; k < 3; k++)
      d += (mesh.positions[v * 3 + k] - smooth[v * 3 + k]) * smoothNormals[v * 3 + k]
    depth[v] = d
  }
  const sorted = Float64Array.from(depth).sort()
  const lo = sorted[Math.floor(sorted.length * 0.02)]
  const hi = sorted[Math.floor(sorted.length * 0.98)]
  return depth.map((d) => Math.min(1, Math.max(0, (d - lo) / (hi - lo || 1))))
}

/**
 * Which triangles the camera sees, from the front (looking along −z) and turned by each of
 * `turns` (radians about the vertical axis through `centre`): an orthographic depth buffer of
 * `size` pixels across, for each view; a triangle counts as seen when any of its pixels is the
 * nearest in any view.
 */
export function seenTriangles(
  { positions, faces },
  { centre, turns = [0], size = 900, tilts = [0] },
) {
  const seen = new Uint8Array(faces.length / 3)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i] - centre[0])
    maxX = Math.max(maxX, positions[i] - centre[0])
    minY = Math.min(minY, positions[i + 1] - centre[1])
    maxY = Math.max(maxY, positions[i + 1] - centre[1])
  }
  const span = Math.max(maxX - minX, maxY - minY) * 1.25
  const scale = size / span
  for (const turn of turns)
    for (const tilt of tilts) {
      const cy = Math.cos(turn)
      const sy = Math.sin(turn)
      const cx = Math.cos(tilt)
      const sx = Math.sin(tilt)
      const project = (i) => {
        const x0 = positions[i * 3] - centre[0]
        const y0 = positions[i * 3 + 1] - centre[1]
        const z0 = positions[i * 3 + 2] - centre[2]
        const x1 = x0 * cy + z0 * sy
        const z1 = -x0 * sy + z0 * cy
        const y2 = y0 * cx - z1 * sx
        const z2 = y0 * sx + z1 * cx
        return [x1 * scale + size / 2, -y2 * scale + size / 2, z2]
      }
      const projected = new Float64Array((positions.length / 3) * 3)
      for (let v = 0; v < positions.length / 3; v++) projected.set(project(v), v * 3)
      const depth = new Float64Array(size * size).fill(-Infinity)
      const owner = new Int32Array(size * size).fill(-1)
      for (let f = 0; f < faces.length; f += 3) {
        const [a, b, c] = [faces[f], faces[f + 1], faces[f + 2]].map((v) => [
          projected[v * 3],
          projected[v * 3 + 1],
          projected[v * 3 + 2],
        ])
        const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])))
        const x1 = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])))
        const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])))
        const y1 = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])))
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
        if (Math.abs(area) < 1e-12) continue
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const px = x + 0.5
            const py = y + 0.5
            const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area
            const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area
            const w2 = 1 - w0 - w1
            if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
            const z = w0 * a[2] + w1 * b[2] + w2 * c[2]
            const at = y * size + x
            if (z > depth[at]) {
              depth[at] = z
              owner[at] = f / 3
            }
          }
      }
      for (const f of owner) if (f >= 0) seen[f] = 1
    }
  return seen
}

/**
 * About `count` points spread evenly over the triangles `weight` gives a weight (0 leaves one
 * out), with each point's normal and fold depth taken from its triangle's corners. Evenly: points
 * are drawn by area, and one closer than `spacing` to a point already kept is dropped (a cheap
 * blue noise), with `spacing` found so that about `count` remain.
 */
export function samplePoints(mesh, normals, depth, weight, { count, seed = 1 }) {
  const { positions, faces } = mesh
  const triangles = faces.length / 3
  const cumulative = new Float64Array(triangles)
  let total = 0
  for (let t = 0; t < triangles; t++) {
    const [a, b, c] = [faces[t * 3], faces[t * 3 + 1], faces[t * 3 + 2]].map((v) =>
      vertex(positions, v),
    )
    const n = cross(sub(b, a), sub(c, a))
    total += (Math.hypot(...n) / 2) * weight[t]
    cumulative[t] = total
  }
  const pick = (r) => {
    let lo = 0
    let hi = triangles - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cumulative[mid] < r * total) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  // Spacing for `count` points in a hexagonal packing over the weighted area.
  const spacing = Math.sqrt((2 * total) / (Math.sqrt(3) * count)) * 0.74
  const rand = random(seed)
  const cell = spacing
  const grid = new Map()
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`
  const out = { positions: [], normals: [], shades: [] }
  let misses = 0
  while (out.shades.length < count && misses < count * 30) {
    const t = pick(rand())
    let u = rand()
    let v = rand()
    if (u + v > 1) {
      u = 1 - u
      v = 1 - v
    }
    const w = 1 - u - v
    const corners = [faces[t * 3], faces[t * 3 + 1], faces[t * 3 + 2]]
    const mix = (array, k) =>
      w * array[corners[0] * 3 + k] + u * array[corners[1] * 3 + k] + v * array[corners[2] * 3 + k]
    const p = [mix(positions, 0), mix(positions, 1), mix(positions, 2)]
    const [cx, cy, cz] = p.map((value) => Math.floor(value / cell))
    let near = false
    for (let dx = -1; dx <= 1 && !near; dx++)
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dz = -1; dz <= 1 && !near; dz++)
          for (const q of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? [])
            if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < spacing) {
              near = true
              break
            }
    if (near) {
      misses++
      continue
    }
    const k = key(...p)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(p)
    const n = [mix(normals, 0), mix(normals, 1), mix(normals, 2)]
    const length = Math.hypot(...n) || 1
    out.positions.push(...p)
    out.normals.push(n[0] / length, n[1] / length, n[2] / length)
    out.shades.push(w * depth[corners[0]] + u * depth[corners[1]] + v * depth[corners[2]])
  }
  return out
}
