# Next task

Status: **open**
Written: 2026-10-01, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: CI minutes, decisions after M6, the handoff files, then M4b

Start by reading `CLAUDE.md` and `PLAN.md`, especially the latest notes in §20 (M5 and M6).

### 0. CI minutes first

The repository is private, so GitHub Actions has a monthly allowance of 2,000 minutes on the Free plan, and when it runs out, CI and with it every deploy stops. From the run history: about 1,070 minutes in September and about 450 on 1 October alone, mostly two full runs of about 15 minutes for every change (the pull request, then `main`). Before M4b, cut this without weakening the checks:

- Do not run CI for changes that touch only documentation (Markdown files, `docs/`), except files the app or a test reads (`content/`, `docs/editor-guide-tr.md`, `docs/tr-strings-review.md`). Make sure nothing waits for a check that no longer runs, and that the deploy after a green run on `main` still works.
- Do not run the full test suite twice for the same code: when a push to `main` contains exactly the tree that passed in its pull request, build and push the image without repeating the tests (or an equivalent saving).
- Record the change in PLAN, and give the minutes per pull request before and after in your report. If CI ever stops for lack of minutes, tell the operator at once.

### 1. Decisions from the M6 report

1. JavaScript budget: 140 KB for ordinary pages and a 137 KB cap for the jobs list, in place of the 130 KB target. Record this in PLAN.
2. Turkish review: change the generator behind `pnpm tr:review` so that `docs/tr-strings-review.md` starts with a separate short section of the strings that will be public at M2 (the coming-soon page, the legal pages, About and the newsletter).
3. Nuray will check the poster's anatomy later; nothing to do until she comments.
4. Content entry is postponed. Add "enter the first 150 positions" to the pre-launch checklist in PLAN §20 as an open item.

### 2. Handoff files (first pull request)

- Add a short "Session handoff" section to `CLAUDE.md` that describes `docs/STATUS.md` and this file as above.
- Create `docs/STATUS.md` now: at most one page, plain language, kept current at the end of every task.

### 3. M4b (accounts), now

At the operator's request, M4b is built now, ahead of the one-time lawyer review and M2, behind the site-wide password, as M5 and M6's home page were (D45). Record this as a new decision in PLAN §22.3 and update the milestone-order note in §20. Accounts stay private until the M6 launch (D39).

Build M4b as defined in PLAN.md: Google, ORCID and email-link sign-in, saved items, the digest settings and subfield preferences (D35), export and delete, the inactivity clean-up, and the data-request page with its automatic acknowledgements.

- Build and test it with fake sign-in providers; the real Google and ORCID keys come later. Test the email links with Mailpit; nothing sends real email until the M2 mailbox.
- Production must keep working without the new settings: sign-in stays switched off on the server until its settings exist. Prepare the new production settings and list them in your report; do not change the server's `.env` without asking.
- In your report, give the exact steps to register the Google and ORCID sign-in apps (where to go, what to enter, redirect addresses, scopes), and list what waits for the M2 mailbox.

### Working rules

As in `CLAUDE.md`: a pull request per step, merged when the checks pass, then one short report at the end. Stop and ask only for rules (a) to (c).
