// The brain model the hero's point cloud is made from (D60), and where it sits in the poster.
//
// "Brain Model" by Nevit Dilmen, NIH 3D 3DPX-002739 (https://3d.nih.gov/entries/3DPX-002739),
// available under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): a whole brain made from
// an MRI scan, with the cerebellum and the brainstem. We make it into a cloud of points (and the
// poster's outline, tools/poster); the About page credits it ("Data and credits").
//
// The STL is not kept in the repository: README.md says where to download it, into source/.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const SOURCE = new URL('source/brain.stl', import.meta.url)
/** The file as downloaded (README.md), so a different file is never used by mistake. */
const SHA256 = 'c154205eba0de965caba983448a71f5eb2c4255c5df45790a20001f930e87cc5'

/** Spots in the poster's viewBox (1360 × 1000): the cell where the wave starts, the labels' anchors. */
export const MODEL = {
  name: '“Brain Model” by Nevit Dilmen, NIH 3D 3DPX-002739',
  licence: 'CC BY 4.0',
  /** The poster's cerebrum, from the frontal to the occipital pole, and its top. */
  fit: { left: 259, right: 1096, top: 118 },
  cell: [310, 446],
  anchors: {
    jobs: [374, 198],
    events: [960, 174],
    funding: [1108, 412],
    papers: [1020, 666],
    news: [476, 642],
    resources: [238, 400],
  },
}

/**
 * The mesh, turned to the scene's axes: x from the frontal pole (left) to the occipital pole, y up,
 * z towards the viewer, who sees the left hemisphere from the side. A binary STL keeps three
 * corners per triangle; corners that coincide are joined, so the surface is one mesh.
 */
export function loadModel() {
  const bytes = readFileSync(SOURCE)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hash !== SHA256) throw new Error(`${SOURCE.pathname}: not the expected file (${hash})`)
  const count = bytes.readUInt32LE(80)
  const index = new Map()
  const positions = []
  const faces = new Uint32Array(count * 3)
  for (let t = 0; t < count; t++)
    for (let c = 0; c < 3; c++) {
      const at = 84 + t * 50 + 12 + c * 12
      // The file's x runs along the brain (frontal pole at −x), y across it, z up.
      const x = bytes.readFloatLE(at)
      const y = bytes.readFloatLE(at + 4)
      const z = bytes.readFloatLE(at + 8)
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`
      let i = index.get(key)
      if (i === undefined) {
        i = positions.length / 3
        index.set(key, i)
        positions.push(x, z, -y)
      }
      faces[t * 3 + c] = i
    }
  return { positions: Float64Array.from(positions), faces }
}
