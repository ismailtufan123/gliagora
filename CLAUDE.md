# CLAUDE.md — Gliagora

Instructions for Claude Code in this repository. Read this file first, then `PLAN.md`.

## Project

Gliagora (gliagora.com) is an English-first, global neuroscience hub: jobs, events, funding, papers, news, resources, a world map and a monthly newsletter, **Glia Notes**. Tagline: "Where neuroscience meets".

- Data controller and editor: Nuray Sancar (natural person, Türkiye). The team has no professional web-development background: explain choices briefly and prefer boring, well-documented tools.
- Source of truth: `PLAN.md`. Recorded decisions are in §22.3 (D1–D22). If a task conflicts with `PLAN.md`, stop and ask.

## Current milestone

**M1 Design system and shell** (PLAN §20). Milestone order: M0 → M1 → M3 → S (one-time server setup) → M2 → M4 → … (D23).

The production server (Hosting Türkiye, Istanbul, Ubuntu 24.04, 3 vCPU, 4 GB RAM) is bought but not set up. Server setup is postponed until just before M4: do not work on the server until the operator says so. Work locally only; nothing may depend on a live server. The server files in `deploy/` are prepared but have never been run.

## Stack (PLAN §11)

- One TypeScript app: Next.js (App Router) + Payload CMS 3, on PostgreSQL. Package manager: pnpm. Node.js: current LTS.
- Docker Compose for local development and production. Images are built in GitHub Actions and pushed to GHCR; the server only pulls and runs them (it has 4 GB RAM, so it never builds).
- Production services on one server: Caddy (TLS and reverse proxy), the app, one PostgreSQL instance (separate databases for Payload, listmonk and Umami), listmonk (newsletter), Umami (cookieless analytics).
- Later milestones: MapLibre with self-hosted PMTiles (M5); Three.js + GSAP hero on the home route only (M13).

## Non-negotiable rules

### Privacy and law (PLAN §15, §18)

- All personal data stays on servers in Türkiye (D6, D22). Do not add any service that receives visitor or subscriber data: no Google Fonts, no external CDNs, no third-party analytics or tracking scripts, no embedded social widgets, no reCAPTCHA (spam protection is ALTCHA).
- Public pages load nothing from other domains. Fonts are self-hosted WOFF2.
- Local and staging environments use generated fake data only. Never put real personal data in fixtures, tests, logs, issues or prompts.
- Collect the minimum: the newsletter stores an email address only. No application-level IP logging; access-log retention follows PLAN §18.
- Social profiles (Instagram, LinkedIn) are plain `<a>` links (D14).

### Secrets

- Never commit secrets. Use a git-ignored `.env` and keep `.env.example` current with placeholder values.
- Never print secrets in logs or CI output.

### Content

- Job listings link to the employer's own page (PLAN §15).
- Papers of the month: openly licensed only (CC BY, CC BY-SA, CC0) (D4).
- Bench to Bedside: research translation only, never medical advice (D19).

## Design (PLAN §7)

- Colour tokens: ink `#1E2152`, magenta `#B8286E`, link blue `#146992`, paper `#EEF0F4`, night `#161942`; dark-mode tints `#F06AAE` and `#5CC8EC`. Keep WCAG AA contrast.
- Type: Commissioner (display) and Atkinson Hyperlegible Next (body and UI), both self-hosted.
- Logo: concept 6b "Calcium wave with astrocyte" (D12). Files in `public/brand/`: `gliagora-mark.svg` (light backgrounds), `gliagora-mark-dark.svg` (dark), `gliagora-mark-mono.svg`, `gliagora-mark-small.svg` (24–32 px) and `favicon.svg` (16 px, D24). Use them as given; do not redraw them.
- Accessibility: semantic HTML, full keyboard use, visible focus, `prefers-reduced-motion` respected; target 0 critical axe issues.
- Performance: Core Web Vitals "good", no layout shift, JavaScript only where it is needed.

## How to work

- Small, reviewable steps: one branch from the latest `main` and one pull request per step. The PR description summarises what changed, how to run it and what to check.
- Proceed through approved milestone steps without waiting for review. Merge each step's PR yourself once `pnpm lint`, `pnpm typecheck`, `pnpm test` and the build pass (and CI is green), then continue from the updated `main`.
- Stop and ask only before:
  - (a) anything that touches the production server (running commands on it or deploying to it);
  - (b) using real personal data;
  - (c) publishing legal texts (placeholders that say the texts are in preparation are fine).
- Explain any destructive command before running it.
- Test data logic (listing expiry, deduplication, taxonomy).
- Commit messages: short and imperative, e.g. "Add coming-soon page".
- If an implementation choice changes the plan, propose the `PLAN.md` edit in the same change.

## Code conventions

- User-visible text lives only in `messages/{locale}.json` (next-intl, PLAN §12). Lint rejects literal text in JSX: element text, conditionals and attributes people read or hear (`alt`, `title`, `aria-label`, `placeholder`, …). It cannot see text passed to your own components' props (e.g. `Lockup name=…`) or built in metadata, so take those from `t()` too. Both locales must have the same keys, placeholders and tags (a test checks this).
- Colours, type sizes, radii and shadows come only from the design tokens (`src/app/(frontend)/tokens.css`, exposed as Tailwind utilities). A test rejects raw colour values anywhere else; the only exception is the browser theme colour in `src/lib/metadata.ts`, which the test checks against the `--bg` tokens.
- Each locale is a static folder: `src/app/(frontend)/en/…` and `src/app/(frontend)/tr/…`. URLs always end with a slash. Pages that exist only in English link there from other locales (`paths` in `src/lib/site.ts`).
- Navigation lives in `src/lib/site.ts` (windows, sections, paths) and `src/lib/navigation.ts` (mega-menus). Every link in the header and footer must lead to a page (an end-to-end test checks this): a section that is not built yet gets a `PlaceholderPage` (`noindex`) until its milestone.
- Header menus are `<details>` disclosures that work without JavaScript; `DisclosureEnhancer` adds Esc, outside click and the mobile menu's inert background.
- Do not call `notFound()` inside a page: in Next.js 16.3 its 404 content renders only with JavaScript. Unknown public URLs, including unknown paths under `/en/` and `/tr/`, already get the server-rendered global 404 (`src/app/global-not-found.tsx`); `/admin` and `/api` answer their own 404s (Payload). Detail pages (M4) need a decision on how to answer 404 and 410 on the server.

## Commands

Fill these in as the project grows.

- `docker compose up -d db` — start local PostgreSQL (values from `.env`; copy `.env.example`)
- `pnpm migrate` — apply database migrations
- `pnpm dev` — run the app locally (site on `/`, admin on `/admin`)
- `pnpm lint`, `pnpm typecheck`, `pnpm test` — checks (`pnpm format` fixes formatting)
- `pnpm test:e2e` — Playwright + axe tests against a running app (`pnpm build && pnpm start`); every new page template goes into `tests/e2e/pages.ts`
- `pnpm migrate:create <name>`, then `pnpm generate:types` — after changing a collection; commit the migration and types with it

## Target repository layout

- `src/` — Next.js and Payload app
- `deploy/` — production Docker Compose file, Caddyfile, server setup and backup scripts (PLAN §11.5)
- `.github/workflows/` — CI
- `PLAN.md`, `CLAUDE.md` — project documents
