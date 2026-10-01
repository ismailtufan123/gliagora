# Status

One page for whoever picks up the work next: what is done, what is live, what is open and what comes next. Updated at the end of every task (CLAUDE.md, "Session handoff"). The details are in `PLAN.md` (the milestone notes in §20, the decisions in §22.3).

Last updated: 2026-10-02, at the end of the task "CI minutes, decisions after M6, the handoff files, then M4b" (`docs/NEXT.md`, done: pull requests #62–#71).

## Done

- **M0, M1, M3, M4**: the site's frame, the design system, the taxonomy and institutions (ROR), and the jobs window (list, filters, job pages, suggest a listing, report a problem, search, sitemaps, the review queue, the scheduled clean-ups and emails).
- **S** (2026-09-30): the production server in Istanbul runs the site behind a site-wide password.
- **M5** (2026-10-01): the world map and the jobs list's map view, with the basemap on the server.
- **M6's home page** (2026-10-01): the poster hero, the live figures, the latest positions and deadlines. The public launch itself waits (below).
- **CI minutes** (2026-10-01, D46): changes to documentation only run no CI, and `main` no longer repeats the tests its pull request passed. The decisions after M6 are recorded (D47).
- **M4b, member accounts** (2026-10-02, D48, D49): sign in with Google, ORCID or an email link; save positions; the newsletter choice and preferred subfields; download your data and delete your account; the clean-up of inactive accounts; and the data-request form, which acts only after the person confirms by email. Tested with fake Google and ORCID and a local test mailbox (Mailpit); no real accounts or emails yet.

## Live now

- Everything runs on the production server, **behind the site-wide password**, except `/health/`. Nobody outside can see it yet.
- Every merge to `main` whose CI passes is deployed by itself, about a quarter of an hour later (until M2, D43).
- **M4b is deployed, but sign-in is switched off there**: the sign-in page says "Signing in is not available yet", the jobs list has no Save buttons, and the data-request form says it is temporarily unavailable. It switches on only after the new server files are copied, then the real Google and ORCID keys are set (both with the operator's go-ahead), and, for email links and the form, the M2 mailbox.
- No real positions are entered yet, so the home page's figures read 0. No email is sent yet.
- **CI minutes are high in October**: each code pull request now costs about 20–25 minutes (the tests grew with M4b), a merge to `main` 4–8, documentation 0. Check the month's usage at github.com/settings/billing; if the 2,000 free minutes run out, CI and deploys stop until the next month.

## Open decisions and waiting items

- **M4b design (D49)**, for the operator to review (the M4b report explains each): the header has one "Account" link for everyone instead of a menu that changes after sign-in; other data requests get an email with a confirmation link instead of a plain acknowledgement; a confirmed deletion also deletes an account with that address and clears it from problem reports (not from personal-rights requests); no email after a deletion for inactivity, and accounts without an email address are deleted without warning; accounts are never merged once they exist; account deletion is confirmed on its own page; the Google sign-in app stays in "Testing" until the launch. Open for M2: should deleting an inactive account also end its newsletter subscription? (Proposal: no.)
- **Real sign-in**: register the Google and ORCID apps (steps in the M4b report). The first ORCID sign-in shows whether ORCID works with our safety checks.
- **Lawyer review** (`docs/legal-open-questions.md`), before M2. M4b added points to B4, B5, B9, B11 and B13 (listed there). All legal texts stay drafts until the operator approves them.
- **On the server, with the operator's go-ahead**: remove, once, the old copies of the database that earlier restore tests left behind (`deploy/README.md` step 7).
- **M2** (newsletter, the mailbox, the first public pages) starts only when the operator says so.
- **Public launch (M6)**: needs at least 150 verified positions in at least 25 countries and the pre-launch checklist (PLAN §20).
- **Content entry**: postponed by the operator; entering the first 150 positions is on the pre-launch checklist.
- **The poster's anatomy**: Nuray checks it later; nothing to do until she comments.

## Next step

The one-time lawyer review, then M2. Nothing starts before the operator says so.
