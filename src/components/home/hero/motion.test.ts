import { describe, expect, it } from 'vitest'

import {
  FOCUS_SECONDS,
  INTRO_SECONDS,
  JOURNEY_SHARE,
  REST,
  focusAt,
  follow,
  introAt,
  journeyAt,
} from './motion'

describe('the hero’s timing (PLAN §10.3)', () => {
  it('the arrival (F2) gathers the points, turns the brain and runs one wave in 1.6 s', () => {
    expect(INTRO_SECONDS).toBe(1.6)
    const start = introAt(0)
    expect(start.gather).toBe(0)
    expect(start.wave).toBe(-1)
    expect(start.turn).toBeLessThan(0)
    expect(start.moving).toBe(true)

    // The wave starts as the points settle, crosses the brain in about a second (from its cell to
    // the far end, 0 to 1) and fades out before the arrival ends, so it never stops abruptly.
    expect(introAt(0.24).wave).toBe(-1)
    expect(introAt(0.25).wave).toBe(0)
    const across = (share: number) => {
      let t = 0.25
      while (introAt(t).wave < share) t += 0.005
      return t
    }
    expect(across(1) - across(0.02)).toBeGreaterThan(0.8)
    expect(introAt(1.2).waveFade).toBe(1)
    expect(introAt(INTRO_SECONDS - 0.001).waveFade).toBeLessThan(0.01)

    const end = introAt(INTRO_SECONDS)
    expect(end.gather).toBe(1)
    expect(end.waveFade).toBe(0)
    expect(end.turn).toBeCloseTo(0, 10)
    expect(end.moving).toBe(false)
    expect(REST).toEqual({ gather: 1, wave: -1, waveFade: 0, turn: 0, moving: false })
  })

  it('never moves backwards during the arrival', () => {
    let before = introAt(0)
    for (let t = 0.02; t <= INTRO_SECONDS; t += 0.02) {
      const now = introAt(t)
      expect(now.gather).toBeGreaterThanOrEqual(before.gather)
      expect(now.wave).toBeGreaterThanOrEqual(before.wave)
      expect(now.waveFade).toBeLessThanOrEqual(before.waveFade)
      expect(now.turn).toBeGreaterThanOrEqual(before.turn)
      before = now
    }
  })

  it('the wave to a label (F3) reaches it in 400 ms and fades 300 ms after the label is left', () => {
    expect(FOCUS_SECONDS).toBe(0.4)
    expect(focusAt(0, null)).toEqual({ run: 0, strength: 1, moving: true })
    expect(focusAt(0.2, null).run).toBeCloseTo(0.5, 5)
    expect(focusAt(FOCUS_SECONDS, null)).toEqual({ run: 1, strength: 1, moving: false })
    // Held: it stays at the label, glowing, and nothing needs drawing.
    expect(focusAt(3, null)).toEqual({ run: 1, strength: 1, moving: false })
    // Left after 1 s: it fades over 0.3 s, then stops.
    expect(focusAt(1.15, 1)).toMatchObject({ run: 1, moving: true })
    expect(focusAt(1.15, 1).strength).toBeCloseTo(0.5, 5)
    expect(focusAt(1.3, 1)).toEqual({ run: 1, strength: 0, moving: false })
  })

  it('follows a target the same way at any frame rate', () => {
    // One step of 1/30 s lands where two steps of 1/60 s do.
    const once = follow(0, 1, 1 / 30)
    const twice = follow(follow(0, 1, 1 / 60), 1, 1 / 60)
    expect(once).toBeCloseTo(twice, 10)
    expect(follow(0.3, 0.3, 1)).toBe(0.3)
    expect(follow(0, 1, 0)).toBe(0)
  })
})

describe('the journey into the cortex (F4, F6)', () => {
  it('starts and ends at rest, and depends on the scroll alone', () => {
    expect(journeyAt(0)).toEqual({
      zoom: 0,
      toCell: 0,
      toMark: 0,
      labels: 1,
      still: 1,
      handing: false,
    })
    expect(journeyAt(1)).toEqual({
      zoom: 0,
      toCell: 1,
      toMark: 1,
      labels: 0,
      still: 0,
      handing: true,
    })
    // Scrolling back retraces it exactly (F6).
    expect(journeyAt(0.4)).toEqual(journeyAt(0.4))
    expect(JOURNEY_SHARE).toBeLessThanOrEqual(0.6)
  })

  it('goes in, gathers the cell, comes out as the mark', () => {
    // In towards the cell first, then back out while the cell's waves become the arcs.
    expect(journeyAt(0.35).zoom).toBe(1)
    expect(journeyAt(0.45).zoom).toBe(1)
    expect(journeyAt(0.7).zoom).toBeGreaterThan(0)
    expect(journeyAt(0.7).zoom).toBeLessThan(1)
    // The astrocyte is gathered before its waves spread.
    expect(journeyAt(0.55).toCell).toBe(1)
    expect(journeyAt(0.55).toMark).toBe(0)
    // The labels have handed over before the camera is in.
    expect(journeyAt(0.3).labels).toBe(0)
    expect(journeyAt(0.89).handing).toBe(false)
    expect(journeyAt(0.9).handing).toBe(true)
  })

  it('never moves backwards on the way in', () => {
    let before = journeyAt(0)
    for (let p = 0.01; p <= 1; p += 0.01) {
      const now = journeyAt(p)
      expect(now.toCell).toBeGreaterThanOrEqual(before.toCell)
      expect(now.toMark).toBeGreaterThanOrEqual(before.toMark)
      expect(now.labels).toBeLessThanOrEqual(before.labels)
      before = now
    }
  })
})
