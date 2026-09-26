import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone for the Docker image.
  output: 'standalone',
  poweredByHeader: false,
  // PLAN §2.1: every URL ends with a slash, and `/` goes to the English home page.
  trailingSlash: true,
  async redirects() {
    return [{ source: '/', destination: '/en/', permanent: true }]
  },
  // Stop `next dev` from appending its own block to CLAUDE.md when it detects an AI agent.
  agentRules: false,
  turbopack: {
    root: path.resolve(dirname),
  },
  experimental: {
    // One 404 page for every URL that matches no route, including unknown paths under /en/ and
    // /tr/ (src/app/global-not-found.tsx): the site and the Payload admin have separate root
    // layouts, so there is no shared layout to render it in.
    globalNotFound: true,
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const config = withPayload(withNextIntl(nextConfig), { devBundleServerPackages: false })

// Payload asks every URL for the colour-scheme client hint so its admin can pick a theme.
// On public pages `Critical-CH` makes Chrome send the first request twice, so keep it to /admin.
const payloadHeaders = config.headers
config.headers = async () =>
  ((await payloadHeaders?.()) ?? []).map((rule) =>
    rule.source === '/:path*' ? { ...rule, source: '/admin/:path*' } : rule,
  )

export default config
