// The model in the scene's units (model.mjs, fitted to the poster): 1 is the poster box's height,
// centred on 0, the box 1.36 wide. Its length (frontal to occipital pole) is the poster's cerebrum's
// and its top is the cerebrum's top (MODEL.fit), so the 3D brain's first frame takes the poster's
// place, and the poster is drawn from this same fit (tools/poster).
import { loadModel, MODEL } from './model.mjs'

export const ASPECT = 1360 / 1000
/** A spot in the poster's viewBox to the scene's units (on the plane at depth 0). */
export const toScene = ([x, y]) => [x / 1000 - ASPECT / 2, 0.5 - y / 1000]

export function fittedModel() {
  const mesh = loadModel()
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < mesh.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], mesh.positions[i + k])
      max[k] = Math.max(max[k], mesh.positions[i + k])
    }
  const [left, top] = toScene([MODEL.fit.left, MODEL.fit.top])
  const [right] = toScene([MODEL.fit.right, MODEL.fit.top])
  const scale = (right - left) / (max[0] - min[0])
  const shift = [left - min[0] * scale, top - max[1] * scale, -((min[2] + max[2]) / 2) * scale]
  for (let i = 0; i < mesh.positions.length; i += 3)
    for (let k = 0; k < 3; k++) mesh.positions[i + k] = mesh.positions[i + k] * scale + shift[k]
  const centre = [0, 1, 2].map((k) => ((min[k] + max[k]) / 2) * scale + shift[k])
  return { mesh, centre, scale }
}
