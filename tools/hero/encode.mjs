// Writes the hero's point cloud in the format that src/components/home/hero/data.ts reads (its
// comment describes the layout). Positions are fractions of `box`, so the box must hold them all.

const BITS = [11, 11, 10]

/** Octahedral encoding of a unit vector into two values in −1…1. */
function octEncode(x, y, z) {
  const sum = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1
  let u = x / sum
  let v = y / sum
  if (z < 0) {
    const ou = u
    u = (1 - Math.abs(v)) * Math.sign(ou || 1)
    v = (1 - Math.abs(ou)) * Math.sign(v || 1)
  }
  return [u, v]
}

const clampByte = (value) => Math.max(-127, Math.min(127, Math.round(value * 127)))

/**
 * @param {{ positions: ArrayLike<number>, normals: ArrayLike<number>, shades: ArrayLike<number>,
 *   logo: { positions: ArrayLike<number>, parts: ArrayLike<number> } }} cloud
 * @param {{ min: number[], max: number[] }} box
 * @returns {Uint8Array}
 */
export function encodeHeroPoints(cloud, box) {
  const count = cloud.shades.length
  const logoCount = cloud.logo.parts.length
  const bytes = new Uint8Array(16 + count * 7 + logoCount * 3)
  const view = new DataView(bytes.buffer)
  bytes.set(
    [...'GLH1'].map((c) => c.charCodeAt(0)),
    0,
  )
  view.setUint32(4, count, true)
  view.setUint32(8, logoCount, true)
  for (let i = 0; i < count; i++) {
    let packed = 0
    let shift = 0
    for (let axis = 0; axis < 3; axis++) {
      const max = 2 ** BITS[axis] - 1
      const t = (cloud.positions[i * 3 + axis] - box.min[axis]) / (box.max[axis] - box.min[axis])
      if (!(t >= 0 && t <= 1)) throw new Error(`Point ${i} lies outside the box`)
      packed += Math.round(t * max) * 2 ** shift
      shift += BITS[axis]
    }
    view.setUint32(16 + i * 4, packed, true)
    const [u, v] = octEncode(
      cloud.normals[i * 3],
      cloud.normals[i * 3 + 1],
      cloud.normals[i * 3 + 2],
    )
    view.setInt8(16 + count * 4 + i * 2, clampByte(u))
    view.setInt8(16 + count * 4 + i * 2 + 1, clampByte(v))
    bytes[16 + count * 6 + i] = Math.max(0, Math.min(255, Math.round(cloud.shades[i] * 255)))
  }
  const logoStart = 16 + count * 7
  for (let i = 0; i < logoCount * 2; i++) {
    bytes[logoStart + i] = Math.max(
      0,
      Math.min(255, Math.round((cloud.logo.positions[i] / 200) * 255)),
    )
  }
  bytes.set(cloud.logo.parts, logoStart + logoCount * 2)
  return bytes
}
