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
  file: '/hero/brain-30eab3072b.bin',
  box: {
    min: [-0.4216, -0.30569, -0.26951],
    max: [0.41643, 0.38248, 0.32887],
  },
  aspect: 1.36,
  centre: [-0.0025, 0.0385, 0],
  origin: [-0.3718, 0.0546, 0.172],
  waveWidth: 0.032,
  waveReach: 0.8311,
  anchors: {
    jobs: [-0.3031, 0.2811, 0.0425],
    events: [0.2663, 0.2993, 0.0768],
    funding: [0.4032, 0.0786, 0.0619],
    papers: [0.3231, -0.1583, -0.0397],
    news: [-0.1883, -0.1163, 0.1605],
    resources: [-0.4189, 0.1034, 0.0634],
  },
}
