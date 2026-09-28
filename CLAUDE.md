# CLAUDE.md — Gliagora

Instructions for Claude Code in this repository. Read this file first, then `PLAN.md`.

## Project

Gliagora (gliagora.com) is an English-first, global neuroscience hub: jobs, events, funding, papers, news, resources, a world map and a monthly newsletter, **Glia Notes**. Tagline: "Where neuroscience meets".

- Data controller and editor: Nuray Sancar (natural person, Türkiye). The team has no professional web-development background: explain choices briefly and prefer boring, well-documented tools.
- Source of truth: `PLAN.md`. Recorded decisions are in §22.3 (D1–D38). If a task conflicts with `PLAN.md`, stop and ask.

## Current milestone

**M4 Jobs**, built and tested locally with fake data only (D38). Content entry waits for the server; parts that need production (scheduled jobs, emails) are built and tested locally but not deployed. Milestone order: M0 → M1 → M3 → M4 (local) → S (one-time server setup) → one-time lawyer review → M2 → M4b → … (PLAN §20, D32, D38). The whole site stays private until M2 (D32).

The production server (Hosting Türkiye, Istanbul, Ubuntu 24.04, 3 vCPU, 4 GB RAM) is bought but not set up. Server setup (S) is postponed: do not work on the server until the operator says so. Work locally only; nothing may depend on a live server. The server files in `deploy/` are prepared but have never been run.

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
- Social profiles (Instagram, LinkedIn) are plain `<a>` links (D14), hidden until the operator sends the exact addresses (D31); never guess them.

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
- Logo: concept 6b "Calcium wave with astrocyte" (D12). Files in `public/brand/`: `gliagora-mark.svg` (light backgrounds), `gliagora-mark-dark.svg` (dark), `gliagora-mark-mono.svg`, `gliagora-mark-small.svg` (24–32 px), `gliagora-mark-small-dark.svg` (the small mark in the dark-mode colours of `gliagora-mark-dark.svg`, added in M1) and `favicon.svg` (16 px, D24). Use them as given; do not redraw them.
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
- Long-form pages (About, legal texts) are Markdown in `content/{locale}/…`, listed in `src/lib/content.ts` and rendered by `ContentPage` (D28). A legal text keeps `draft: true` (draft notice, `noindex`) until the operator approves that exact text; never set it to `false` on your own, and do not merge a change to an approved (non-draft) legal text without the operator's approval. In these files, mark a phrase in another language as `{en: Suggest a listing}` or `{tr: açık rıza}` (WCAG 3.1.2), and an open point as `[TO DECIDE: …]` / `[KARAR VERİLECEK: …]`; links may only be site paths, `https://`, `http://` or `mailto:`.
- Navigation lives in `src/lib/site.ts` (windows, sections, paths) and `src/lib/navigation.ts` (mega-menus). Every link in the header and footer must lead to a page (an end-to-end test checks this): a section that is not built yet gets a `PlaceholderPage` (`noindex`) until its milestone.
- Header menus are `<details>` disclosures that work without JavaScript; `DisclosureEnhancer` adds Esc, outside click and the mobile menu's inert background.
- Do not call `notFound()` inside a page: in Next.js 16.3 its 404 content renders only with JavaScript. Unknown public URLs, including unknown paths under `/en/` and `/tr/`, already get the server-rendered global 404 (`src/app/global-not-found.tsx`); `/admin` and `/api` answer their own 404s (Payload). Removed fixed paths answer 410: `src/proxy.ts` checks `isGone()` in `src/lib/gone.ts` and shows the removed-page with status 410. Pages that show a database record (institutions, subfield hubs, jobs; events from M8) are resolved in the proxy before rendering (`src/lib/detail-routes.ts`, with the database lookup in `src/lib/detail-lookup.ts`): unknown record, draft or job in review → 404, outdated or missing slug → 308, retired subfield, withdrawn job or job closed 30 days ago → 410 with the same removed-page (`listingState()` in `src/lib/jobs/deadline.ts`). Add each new detail route there, and give its page `export const dynamic = 'force-dynamic'` (the build has no database).
- Payload is loaded from `node_modules`, not bundled (`serverExternalPackages` in `next.config.ts`): bundled, the production build copies it into each part of the server (instrumentation, proxy, routes, pages), and errors thrown by one copy fail `instanceof` in another, so the admin loses the per-field messages of refused saves. Keep it that way; `tests/e2e/admin-api.spec.ts` checks it.
- Calendar days (a job's deadline day, "Last verified") are Payload date fields stored at noon UTC, so their UTC date is the day in every time zone; read them with `calendarDay()` and get instants with `deadlineEnd()` in `src/lib/jobs/deadline.ts` (a deadline day ends at midnight in `deadlineTz`, the institution's time zone unless the posting names another, or Anywhere on Earth when the zone is unknown), never with the server's or the browser's time zone. Show them with `formatDay()` and `deadlineView()` in `src/lib/jobs/format.ts`, and take "now" from `requestTime()` in `src/lib/records.ts`, read once per request so a page, its lists and its metadata agree.

## Commands

Fill these in as the project grows.

- `docker compose up -d db` — start local PostgreSQL (values from `.env`; copy `.env.example`)
- `pnpm migrate` — apply database migrations
- `pnpm dev` — run the app locally (site on `/`, admin on `/admin`)
- `pnpm lint`, `pnpm typecheck`, `pnpm test` — checks (`pnpm format` fixes formatting)
- `pnpm test:e2e` — Playwright + axe tests against a running app (`pnpm build && pnpm start`); every new page template goes into `tests/e2e/pages.ts`
- `pnpm migrate:create <name>`, then `pnpm generate:types` — after changing a collection; commit the migration and types with it
- `pnpm ror:import tests/fixtures/ror/v2.13-2026-09-22-ror-data-sample.zip` — load 20 test institutions (21 ROR records, one withdrawn and skipped; the e2e tests need them); without a file it downloads and imports the latest ROR release (about 15 minutes the first time)
- `pnpm fake:jobs` — replace the fake jobs at the test institutions (run it after `pnpm ror:import`): about 60 generated ones plus the fixed ones the e2e tests use (`src/scripts/fake-jobs-fixed.ts`: open, closing soon, rolling, closed recently, gone, withdrawn, draft), then fake review-queue suggestions and candidates in every state (`src/scripts/fake-queue-data.ts`). It refuses to run where `PAYLOAD_JOBS_AUTORUN` is `true` (production)
- `E2E_EDITOR_PASSWORD=… pnpm e2e:editor` — add (or reset) the test editor `e2e-editor@example.org` that the admin API end-to-end test signs in with; pass the same `E2E_EDITOR_PASSWORD` to `pnpm test:e2e` (without it that test is skipped locally; CI always runs it). It refuses to run where `PAYLOAD_JOBS_AUTORUN` is `true` (production)

## Target repository layout

- `src/` — Next.js and Payload app
- `deploy/` — production Docker Compose file, Caddyfile, server setup and backup scripts (PLAN §11.5)
- `.github/workflows/` — CI
- `PLAN.md`, `CLAUDE.md` — project documents
