# Status

One page for whoever picks up the work next: what is done, what is live, what is open and what comes next. Updated at the end of every task (CLAUDE.md, "Session handoff"). The details are in `PLAN.md` (the milestone notes in §20, the decisions in §22.3).

Last updated: 2026-10-02, during the task "the M4b decisions, the server steps, then M2's technical parts behind the password" (`docs/NEXT.md`, open). The previous task (CI minutes, decisions after M6, the handoff files, then M4b) was done with pull requests #62–#71.

## Done

- **M0, M1, M3, M4**: the site's frame and design system, the taxonomy and institutions (ROR), and the jobs window (list, filters, job pages, the suggest and report forms, search, the review queue, the scheduled clean-ups and emails).
- **S** (2026-09-30): the production server in Istanbul runs the site behind a site-wide password.
- **M5 and M6's home page** (2026-10-01): the world map and the jobs list's map view; the poster hero, the live figures, the latest positions and deadlines. The public launch itself waits (below).
- **CI minutes** (2026-10-01, D46): documentation-only changes run no CI, and `main` no longer repeats the tests its pull request passed. The decisions after M6 are recorded (D47).
- **M4b, member accounts** (2026-10-02, D48, D49): sign-in with Google, ORCID or an email link; saved positions; the newsletter choice and preferred subfields; data download and account deletion; the clean-up of inactive accounts; the data-request form, which acts only after the person confirms by email. Tested with fake Google and ORCID and a local test mailbox; no real accounts or emails yet.

## Live now

- Everything runs on the production server, **behind the site-wide password**, except `/health/`. Nobody outside can see it yet.
- Every merge to `main` whose CI passes is deployed by itself, about 5–10 minutes later (until M2, D43).
- **M4b is deployed with sign-in off**: the sign-in page says "Signing in is not available yet", there are no Save buttons, and the data-request form says it is temporarily unavailable. Sign-in needs the new server files, then the real Google and ORCID keys (both with the operator's go-ahead); email links and the form also need the M2 mailbox.
- No real positions yet, so the home page's figures read 0. No email is sent yet.
- **CI minutes are high in October** (a code pull request about 18–25, a merge to `main` 4–8, documentation 0): check github.com/settings/billing; if the 2,000 free minutes run out, CI and deploys stop until the next month.

## Open decisions and waiting items

- **M4b design (D49)**: approved by the operator on 2026-10-02 as built, with one addition (the account page tells members without an email address that we cannot warn them before an inactivity deletion; being built now). Deleting an inactive account does not end its newsletter subscription (decided 2026-10-02).
- **M2's technical parts (D50)**: being built now, behind the password: listmonk, the signup and unsubscribe, the consent log, the members' sync, the M2 state of the site (switched off). Its design points come to the operator for review at the end of the task.
- **Real sign-in**: register the Google and ORCID apps (steps in `deploy/README.md`, step 9). The first ORCID sign-in shows whether ORCID works with our safety checks.
- **Lawyer review** (`docs/legal-open-questions.md`), before M2; M4b added points to B4, B5, B9, B11 and B13. All legal texts stay drafts until the operator approves them.
- **On the server, with the operator's go-ahead**: remove, once, the old copies of the database that earlier restore tests left behind, after copying the new `restore.sh` (`deploy/README.md` steps 7 and 9).
- **M2** (newsletter, mailbox, first public pages) and the **public launch** (M6: at least 150 verified positions in at least 25 countries, and the pre-launch checklist in PLAN §20) start only when the operator says so. Entering the first 150 positions is postponed by the operator.
- **The poster's anatomy**: Nuray checks it later; nothing to do until she comments.

## Next step

Finish the current task (`docs/NEXT.md`): the server steps the operator approved, then M2's technical parts behind the password (D50). After it: the one-time lawyer review, then M2. Nothing else starts before the operator says so.
