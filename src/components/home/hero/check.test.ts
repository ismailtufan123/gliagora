import { describe, expect, it } from 'vitest'

import { HERO_CHECK_SCRIPT } from './check'

type Device = {
  webgl2?: boolean
  reducedMotion?: boolean
  forcedColors?: boolean
  saveData?: boolean
  effectiveType?: string
  deviceMemory?: number
  width?: number
}

/** Runs the page's own script against a pretend browser and returns the poster box's marks. */
function check(device: Device = {}) {
  const {
    webgl2 = true,
    reducedMotion = false,
    forcedColors = false,
    width = 1280,
    deviceMemory,
  } = device
  const box = { dataset: {} as Record<string, string> }
  const media: Record<string, boolean> = {
    '(min-width: 768px)': width >= 768,
    '(prefers-reduced-motion: no-preference)': !reducedMotion,
    '(forced-colors: active)': forcedColors,
  }
  const window = {
    ...(webgl2 ? { WebGL2RenderingContext: class {} } : {}),
    matchMedia: (query: string) => {
      if (!(query in media)) throw new Error(`Unexpected media query ${query}`)
      return { matches: media[query] }
    },
  }
  const navigator = {
    ...(deviceMemory === undefined ? {} : { deviceMemory }),
    ...(device.saveData !== undefined || device.effectiveType
      ? { connection: { saveData: device.saveData ?? false, effectiveType: device.effectiveType } }
      : {}),
  }
  const document = { currentScript: { parentElement: box } }
  new Function('window', 'document', 'navigator', HERO_CHECK_SCRIPT)(window, document, navigator)
  return box.dataset
}

describe('the 3D layer checks (PLAN §10.2, D60)', () => {
  it('loads on a desktop with nothing against it, at full quality', () => {
    expect(check()).toEqual({ hero: 'pending', heroQuality: 'full' })
    expect(check({ deviceMemory: 8, effectiveType: '4g', saveData: false })).toEqual({
      hero: 'pending',
      heroQuality: 'full',
    })
    expect(check({ width: 768, deviceMemory: 4 })).toEqual({ hero: 'pending', heroQuality: 'full' })
  })

  it.each<[string, Device, string]>([
    ['without WebGL2', { webgl2: false }, 'no-webgl2'],
    ['with reduced motion', { reducedMotion: true }, 'reduced-motion'],
    ['in forced colours', { forcedColors: true }, 'forced-colors'],
    ['with Save-Data', { saveData: true }, 'save-data'],
    ['on a 3g connection', { effectiveType: '3g' }, 'slow-connection'],
    ['on a 2g connection', { effectiveType: '2g' }, 'slow-connection'],
    ['on a slow-2g connection', { effectiveType: 'slow-2g' }, 'slow-connection'],
    ['with less than 4 GB', { deviceMemory: 2 }, 'low-memory'],
    ['on a phone with 4 GB', { width: 412, deviceMemory: 4 }, 'small-screen'],
    ['on a phone with less than 4 GB', { width: 412, deviceMemory: 0.5 }, 'low-memory'],
  ])('stays off %s', (_, device, reason) => {
    expect(check(device)).toEqual({ hero: 'off', heroSkip: reason })
  })

  it('tries the lighter quality on a phone that reports 6 GB or more, or nothing', () => {
    expect(check({ width: 412, deviceMemory: 8 })).toEqual({
      hero: 'pending',
      heroQuality: 'phone',
    })
    expect(check({ width: 390 })).toEqual({ hero: 'pending', heroQuality: 'phone' })
    expect(check({ width: 767, effectiveType: '4g' })).toEqual({
      hero: 'pending',
      heroQuality: 'phone',
    })
  })

  it('names the first check that fails', () => {
    expect(check({ webgl2: false, reducedMotion: true, saveData: true })).toEqual({
      hero: 'off',
      heroSkip: 'no-webgl2',
    })
    expect(check({ reducedMotion: true, width: 412, deviceMemory: 2 })).toEqual({
      hero: 'off',
      heroSkip: 'reduced-motion',
    })
  })

  it('does nothing outside its box', () => {
    const run = () =>
      new Function('window', 'document', 'navigator', HERO_CHECK_SCRIPT)(
        {},
        { currentScript: null },
        {},
      )
    expect(run).not.toThrow()
  })
})
