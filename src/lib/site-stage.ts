// The site's stage (D41, D50): which of its pages a visitor reaches without the site-wide
// password, set by one setting, SITE_STAGE, that the app and Caddy both read
// (deploy/compose.prod.yml passes the same value to both, `private` by default):
// - `private` (the default): every page behind the password (Caddy), and the full site as it is
//   built, with its full header and footer (D32);
// - `m2`: the M2 state. Caddy opens the public pages of src/lib/public-pages.ts without the
//   password, and the app shows them in their M2 version: the reduced header and footer, the
//   coming-soon text on /en/, email in place of the suggest and report forms, and robots.txt and
//   sitemaps with only those pages. Everything else stays as it is, behind the password.
// Read at request time, never at build time: the image is built once in CI, without the server's
// settings, so the pages of both stages are built into it (the M2 versions under
// src/app/(frontend)/m2/, which the proxy shows in place of the public pages, src/proxy.ts).
// Any other value counts as `private`, with a problem naming the variable (never its value) for the
// log. Compose passes the same characters to Caddy (deploy/compose.prod.yml), which reads them as
// one name too (`import "stage-{$SITE_STAGE:private}"`, quoted, deploy/Caddyfile): it refuses to
// start with any other value, also `m2` followed by a space, a tab or a comment (or, for a value
// with * ? or ], which it reads as a pattern of files, starts with nothing open, as in private). So
// a misspelt stage opens nothing, and the two never disagree. The proxy marks its public answers
// only in the M2 state (src/lib/public-pages.ts, PUBLIC_MARK), and Caddy passes a public page only
// with that mark: a third safeguard.

type Env = Record<string, string | undefined>

export const SITE_STAGES = ['private', 'm2'] as const
export type SiteStage = (typeof SITE_STAGES)[number]

export type SiteStageSetting = {
  stage: SiteStage
  /** One line for the log when SITE_STAGE has a value that is not a stage: the name, not the value. */
  problem: string | null
}

const isStage = (value: string): value is SiteStage =>
  (SITE_STAGES as readonly string[]).includes(value)

/**
 * The stage SITE_STAGE names: unset or empty is `private`, as in compose.prod.yml. Read exactly as
 * Caddy reads it (no trimming, no change of case: `m2 ` is no stage for either).
 */
export function siteStageSetting(env: Env = process.env): SiteStageSetting {
  const value = env.SITE_STAGE ?? ''
  if (value === '') return { stage: 'private', problem: null }
  if (isStage(value)) return { stage: value, problem: null }
  return {
    stage: 'private',
    problem: `SITE_STAGE is not one of ${SITE_STAGES.join(', ')}: the app shows the private stage, and Caddy opens no public page.`,
  }
}

/** The site's stage, read now (each request: the proxy, robots.txt and the sitemaps). */
export const siteStage = (env: Env = process.env): SiteStage => siteStageSetting(env).stage

/** The start line of the app (src/lib/startup.ts): the stage by its name. */
export const describeSiteStage = (setting: SiteStageSetting) => `Site stage: ${setting.stage}`
