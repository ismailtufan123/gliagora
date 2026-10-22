// Made by tools/hero/build.mjs from “Brain Model” by Nevit Dilmen, NIH 3D 3DPX-002739 (CC BY 4.0); do not edit by hand.
// The point file's name, the box its positions are packed into, the brain's centre, where the
// calcium wave starts (the poster's cell) and how far it runs, and each window's anchor on the
// brain (F3), in the scene's units: the poster's box is 1.36 wide and 1 high, centred on 0.
import type { HeroBox } from './data'

export const HERO_MODEL: {
  file: string
  box: HeroBox
  aspect: number
  centre: [number, number, number]
  origin: [number, number, number]
  waveWidth: number
  waveReach: number
  anchors: Record<string, [number, number, number]>
} = {
  file: '/hero/brain-e98e7caf9d.bin',
  box: {
    min: [-0.42168, -0.30569, -0.26951],
    max: [0.41667, 0.38238, 0.32889],
  },
  aspect: 1.36,
  centre: [-0.0025, 0.0385, 0],
  origin: [-0.3706, 0.0536, 0.1713],
  waveWidth: 0.032,
  waveReach: 0.8301,
  anchors: {
    jobs: [-0.2977, 0.2819, 0.0605],
    events: [0.2609, 0.3046, 0.0737],
    funding: [0.4053, 0.073, 0.0609],
    papers: [0.3243, -0.1575, -0.0416],
    news: [-0.1777, -0.1266, 0.1551],
    resources: [-0.4198, 0.0995, 0.0581],
  },
}
