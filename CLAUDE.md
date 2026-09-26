# CLAUDE.md — Gliagora

Instructions for Claude Code in this repository. Read this file first, then `PLAN.md`.

## Project

Gliagora (gliagora.com) is an English-first, global neuroscience hub: jobs, events, funding, papers, news, resources, a world map and a monthly newsletter, **Glia Notes**. Tagline: "Where neuroscience meets".

- Data controller and editor: Nuray Sancar (natural person, Türkiye). The team has no professional web-development background: explain choices briefly and prefer boring, well-documented tools.
- Source of truth: `PLAN.md`. Recorded decisions are in §22.3 (D1–D22). If a task conflicts with `PLAN.md`, stop and ask.

## Current milestone

**M0 Foundations** (PLAN §20). The production server (Hosting Türkiye, Istanbul, Ubuntu 24.04, 3 vCPU, 4 GB RAM) is being provisioned. Until it is ready, work locally only: nothing may depend on a live server.

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
- Logo: concept 6b "Calcium wave with astrocyte" (D12), with simplified marks for 32/24 px and a 16 px favicon. Use a neutral placeholder until the final SVG files are in `public/brand/`.
- Accessibility: semantic HTML, full keyboard use, visible focus, `prefers-reduced-motion` respected; target 0 critical axe issues.
- Performance: Core Web Vitals "good", no layout shift, JavaScript only where it is needed.

## How to work

- Small, reviewable steps. After each step, summarise what changed, how to run it and what to check.
- Stop and wait for approval before changes to infrastructure, the data model or legal pages.
- Explain any destructive command before running it. Never run commands against the production server unless asked in that session.
- Test data logic (listing expiry, deduplication, taxonomy) and keep `pnpm lint`, `pnpm typecheck` and `pnpm test` passing.
- Commit messages: short and imperative, e.g. "Add coming-soon page".
- If an implementation choice changes the plan, propose the `PLAN.md` edit in the same change.

## Commands

Fill these in as the project grows.

- `docker compose up -d db` — start local PostgreSQL (values from `.env`; copy `.env.example`)
- `pnpm migrate` — apply database migrations
- `pnpm dev` — run the app locally (site on `/`, admin on `/admin`)
- `pnpm lint`, `pnpm typecheck`, `pnpm test` — checks (`pnpm format` fixes formatting)
- `pnpm migrate:create <name>`, then `pnpm generate:types` — after changing a collection; commit the migration and types with it

## Target repository layout

- `src/` — Next.js and Payload app
- `infra/` — production Docker Compose file, Caddyfile, server setup and backup scripts
- `.github/workflows/` — CI
- `PLAN.md`, `CLAUDE.md` — project documents
