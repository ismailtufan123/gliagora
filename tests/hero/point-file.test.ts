import { describe, expect, it } from 'vitest'

import { encodeHeroPoints } from '../../tools/hero/encode.mjs'
import { decodeHeroPoints, heroFileLength } from '../../src/components/home/hero/data'

const box = {
  min: [-1, -0.5, -0.25] as [number, number, number],
  max: [1, 0.5, 0.25] as [number, number, number],
}

function sample() {
  const normals = [
    [0, 0, 1],
    [0, 0, -1],
    [1, 0, 0],
    [0.6, -0.48, -0.64],
  ]
  return {
    positions: [-1, -0.5, -0.25, 1, 0.5, 0.25, 0.123, -0.321, 0.2, 0, 0, 0],
    normals: normals.flat(),
    shades: [0, 1, 0.5, 0.25],
    logo: { positions: [0, 0, 200, 200, 100, 37.5], parts: [0, 1, 2] },
  }
}

describe('the hero point file (PLAN §10.5)', () => {
  it('reads back what the build script writes, within its precision', () => {
    const cloud = sample()
    const bytes = encodeHeroPoints(cloud, box)
    expect(bytes.byteLength).toBe(heroFileLength(4, 3))
    const read = decodeHeroPoints(bytes.buffer as ArrayBuffer, box)
    expect(read.count).toBe(4)
    cloud.positions.forEach((value, i) => {
      // 11, 11 and 10 bits over the box's width, height and depth.
      const step = (box.max[i % 3]! - box.min[i % 3]!) / (i % 3 === 2 ? 1023 : 2047)
      expect(Math.abs(read.positions[i]! - value)).toBeLessThanOrEqual(step / 2 + 1e-6)
    })
    cloud.normals.forEach((value, i) => {
      expect(Math.abs(read.normals[i]! - value)).toBeLessThan(0.03)
    })
    cloud.shades.forEach((value, i) => {
      expect(Math.abs(read.shades[i]! - value)).toBeLessThanOrEqual(1 / 510 + 1e-6)
    })
    expect([...read.logo.parts]).toEqual([0, 1, 2])
    cloud.logo.positions.forEach((value, i) => {
      expect(Math.abs(read.logo.positions[i]! - value)).toBeLessThanOrEqual(200 / 510 + 1e-4)
    })
  })

  it('refuses a point outside the box', () => {
    const cloud = sample()
    cloud.positions[0] = -1.01
    expect(() => encodeHeroPoints(cloud, box)).toThrow(/outside the box/)
  })

  it('refuses a file of another kind or length', () => {
    const bytes = encodeHeroPoints(sample(), box)
    expect(() => decodeHeroPoints(bytes.slice(0, -1).buffer as ArrayBuffer, box)).toThrow()
    const other = bytes.slice()
    other[0] = 0x47 + 1
    expect(() => decodeHeroPoints(other.buffer as ArrayBuffer, box)).toThrow(/GLH1/)
    expect(() => decodeHeroPoints(new ArrayBuffer(8), box)).toThrow(/too short/)
  })
})
