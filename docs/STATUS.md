# Status

One page for whoever picks up the work next: what is done, what is live, what is open and what comes next. Updated at the end of every task (CLAUDE.md, "Session handoff"). The details are in `PLAN.md` (the milestone notes in §20, the decisions in §22.3).

Last updated: 2026-10-01, at the start of the task "CI minutes, decisions after M6, the handoff files, then M4b" (`docs/NEXT.md`).

## Done

- **M0, M1, M3, M4**: the site's frame, the design system, the taxonomy and institutions (ROR), and the jobs window (list, filters, job pages, suggest a listing, report a problem, search, sitemaps, the review queue, the scheduled clean-ups and emails).
- **S** (2026-09-30): the production server in Istanbul runs the site behind a site-wide password.
- **M5** (2026-10-01): the world map and the jobs list's map view, with the basemap on the server.
- **M6's home page** (2026-10-01): the poster hero, the live figures, the latest positions and deadlines. The public launch itself waits (below).

## Live now

- Everything runs on the production server, **behind the site-wide password**, except `/health/`. Nobody outside can see it yet.
- Every merge to `main` whose CI passes is deployed by itself, about a quarter of an hour later (until M2, D43).
- No real positions are entered yet, so the home page's figures read 0.
- No email is sent yet: that waits for the Turkish mailbox at M2.

## Open decisions and waiting items

- **Lawyer review**: the one-time review of the legal texts (`docs/legal-open-questions.md`) comes before M2.
- **M2** (newsletter, the mailbox, the first public pages) starts only when the operator says so.
- **Public launch (M6)**: needs at least 150 verified positions in at least 25 countries and the pre-launch checklist (PLAN §20).
- **Content entry**: postponed by the operator; entering the first 150 positions is on the pre-launch checklist.
- **The poster's anatomy**: Nuray checks it later; nothing to do until she comments.

## Next step

This task, in order: cut the CI minutes; record the decisions after M6; then build **M4b** (member accounts: sign-in with Google, ORCID or an email link, saved positions, digest settings, export and delete, the data-request page), behind the password, with fake sign-in providers until the real Google and ORCID keys exist.
