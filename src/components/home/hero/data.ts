// The hero's point cloud (PLAN §10.5): one binary file in public/hero/, written by
// tools/hero/build.mjs, read here in the browser. Little-endian, in this order:
// - a header of 16 bytes: "GLH1", the number of brain points, the number of logo points, 0;
// - each brain point's position, packed into 32 bits: x in bits 0–10, y in bits 11–21, z in bits
//   22–31, each a fraction of the box in `HeroModel` (hero-model.ts);
// - each point's surface normal, two signed bytes (octahedral encoding);
// - each point's shade, one byte: 0 at the bottom of a sulcus, 255 on the crown of a gyrus;
// - each logo point (the 6b mark's target, tools/hero/logo.mjs): x and y, one byte each, in the
//   mark's 200 units (y down);
// - each logo point's part, one byte: 0 an arc or the bar, 1 the astrocyte, 2 its nucleus.
// The points come in random order, so the first n of them are an even sample of the whole: a
// lighter quality draws fewer, from the start (PLAN §10.5).

export const MAGIC = 'GLH1'

export type HeroBox = { min: [number, number, number]; max: [number, number, number] }

export type HeroPoints = {
  count: number
  /** x, y, z of each point, in the model's units. */
  positions: Float32Array
  /** The unit normal of each point. */
  normals: Float32Array
  /** 0 (deep in a sulcus) to 1 (the crown of a gyrus). */
  shades: Float32Array
  logo: {
    count: number
    /** x, y of each logo point, in the mark's units (0–200, y down). */
    positions: Float32Array
    /** 0 arc, 1 astrocyte, 2 nucleus. */
    parts: Uint8Array
  }
}

const BITS = [11, 11, 10] as const

/** The byte length of a file with `points` brain points and `logo` logo points. */
export function heroFileLength(points: number, logo: number) {
  return 16 + points * 7 + logo * 3
}

/** Octahedral decoding of a unit vector from two values in −1…1. */
function octDecode(x: number, y: number, out: Float32Array, at: number) {
  let nx = x
  let ny = y
  const nz = 1 - Math.abs(x) - Math.abs(y)
  if (nz < 0) {
    nx = (1 - Math.abs(y)) * Math.sign(x || 1)
    ny = (1 - Math.abs(x)) * Math.sign(y || 1)
  }
  const length = Math.hypot(nx, ny, nz) || 1
  out[at] = nx / length
  out[at + 1] = ny / length
  out[at + 2] = nz / length
}

/** Reads the file. Throws on anything that is not a file of this format. */
export function decodeHeroPoints(buffer: ArrayBuffer, box: HeroBox): HeroPoints {
  const view = new DataView(buffer)
  if (buffer.byteLength < 16) throw new Error('Hero data: too short')
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  const count = view.getUint32(4, true)
  const logoCount = view.getUint32(8, true)
  if (magic !== MAGIC || buffer.byteLength !== heroFileLength(count, logoCount))
    throw new Error('Hero data: not a GLH1 file')

  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const shades = new Float32Array(count)
  const packed = new Uint32Array(buffer, 16, count)
  const octa = new Int8Array(buffer, 16 + count * 4, count * 2)
  const shade = new Uint8Array(buffer, 16 + count * 6, count)
  const [sx, sy, sz] = BITS.map((bits, axis) => (box.max[axis]! - box.min[axis]!) / (2 ** bits - 1))
  const [x0, y0, z0] = box.min
  for (let i = 0; i < count; i++) {
    const p = packed[i]!
    positions[i * 3] = x0 + (p & 0x7ff) * sx!
    positions[i * 3 + 1] = y0 + ((p >>> 11) & 0x7ff) * sy!
    positions[i * 3 + 2] = z0 + (p >>> 22) * sz!
    octDecode(octa[i * 2]! / 127, octa[i * 2 + 1]! / 127, normals, i * 3)
    shades[i] = shade[i]! / 255
  }

  const logoStart = heroFileLength(count, 0)
  const logoXY = new Uint8Array(buffer, logoStart, logoCount * 2)
  const logoPositions = new Float32Array(logoCount * 2)
  for (let i = 0; i < logoCount * 2; i++) logoPositions[i] = (logoXY[i]! / 255) * 200
  const parts = new Uint8Array(buffer, logoStart + logoCount * 2, logoCount).slice()

  return {
    count,
    positions,
    normals,
    shades,
    logo: { count: logoCount, positions: logoPositions, parts },
  }
}
