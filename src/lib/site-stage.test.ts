import { describe, expect, it } from 'vitest'

import { describeSiteStage, siteStage, siteStageSetting } from './site-stage'

describe('siteStage (D41, D50)', () => {
  it('is private when SITE_STAGE is unset or empty, as compose.prod.yml defaults it', () => {
    expect(siteStageSetting({})).toEqual({ stage: 'private', problem: null })
    expect(siteStageSetting({ SITE_STAGE: '' })).toEqual({ stage: 'private', problem: null })
  })

  it('reads the stages by their names', () => {
    expect(siteStage({ SITE_STAGE: 'private' })).toBe('private')
    expect(siteStage({ SITE_STAGE: 'm2' })).toBe('m2')
  })

  it('keeps any other value private, naming the variable and never the value', () => {
    // Caddy reads the same characters as one name (the quoted import in deploy/Caddyfile) and
    // refuses to start with any of these (NOT_STAGES in tests/caddy/serve.ts, which
    // tests/e2e/m2.spec.ts gives to Caddy, and tests/caddy/serve.test.ts to this function).
    for (const value of ['M2', ' m2', 'm2 ', 'm2\t', 'm2 x', 'm2\t# go public', 'launch', 'x']) {
      const setting = siteStageSetting({ SITE_STAGE: value })
      expect(setting.stage, JSON.stringify(value)).toBe('private')
      // One fixed text, whatever the value.
      expect(setting.problem).toBe(
        'SITE_STAGE is not one of private, m2: the app shows the private stage, and Caddy opens no public page.',
      )
    }
  })

  it('reads the environment at each call, not once', () => {
    const env: Record<string, string | undefined> = {}
    expect(siteStage(env)).toBe('private')
    env.SITE_STAGE = 'm2'
    expect(siteStage(env)).toBe('m2')
  })

  it('names the stage in the start line', () => {
    expect(describeSiteStage(siteStageSetting({}))).toBe('Site stage: private')
    expect(describeSiteStage(siteStageSetting({ SITE_STAGE: 'm2' }))).toBe('Site stage: m2')
  })
})
