// The model as the scene's camera sees it at rest (hero/scene.ts: a vertical field of view of 18°,
// the poster's box 1 high at depth 0), on the poster's grid: for each pixel of the viewBox
// (1360 × 1000, or `scale` times finer) the nearest surface's depth and triangle. Shared by the
// poster's outline (outline.mjs) and the checks of the build.

export const FOV = 18
export const DISTANCE = 0.5 / Math.tan(((FOV / 2) * Math.PI) / 180)

/** A scene point to the poster's viewBox, through the camera at rest. */
export function toPoster([x, y, z]) {
  const k = DISTANCE / (DISTANCE - z)
  return [680 + 1000 * x * k, 500 - 1000 * y * k]
}

export function depthImage(mesh, scale = 1) {
  const W = 1360 * scale
  const H = 1000 * scale
  const depth = new Float32Array(W * H).fill(-Infinity)
  const owner = new Int32Array(W * H).fill(-1)
  const p = mesh.positions
  const projected = new Float64Array(p.length)
  for (let v = 0; v < p.length / 3; v++) {
    const [x, y] = toPoster([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]])
    projected[v * 3] = x * scale
    projected[v * 3 + 1] = y * scale
    projected[v * 3 + 2] = p[v * 3 + 2]
  }
  const f = mesh.faces
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t] * 3
    const b = f[t + 1] * 3
    const c = f[t + 2] * 3
    const ax = projected[a],
      ay = projected[a + 1],
      az = projected[a + 2]
    const bx = projected[b],
      by = projected[b + 1],
      bz = projected[b + 2]
    const cx = projected[c],
      cy = projected[c + 1],
      cz = projected[c + 2]
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
    if (Math.abs(area) < 1e-12) continue
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)))
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)))
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area
        const w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        const z = w0 * az + w1 * bz + w2 * cz
        const at = y * W + x
        if (z > depth[at]) {
          depth[at] = z
          owner[at] = t / 3
        }
      }
  }
  return { W, H, scale, depth, owner }
}
