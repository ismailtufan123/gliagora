# Status

One page for whoever picks up the work next: what is done, what is live, what is open and what comes next. Updated at the end of every task (CLAUDE.md, "Session handoff"). The details are in `PLAN.md` (the milestone notes in §20, the decisions in §22.3).

Last updated: 2026-10-05, at the end of the task "the M4b decisions, the server steps, then M2's technical parts behind the password" (`docs/NEXT.md`, done: pull requests #73–#78).

## Done

- **M0, M1, M3, M4**: the site's frame and design system, the taxonomy and institutions (ROR), and the jobs window (list, filters, job pages, the suggest and report forms, search, the review queue, the scheduled clean-ups and emails).
- **S** (2026-09-30): the production server in Istanbul runs the site behind a site-wide password.
- **M5 and M6's home page** (2026-10-01): the world map and the jobs list's map view; the poster hero, the live figures, the latest positions and deadlines. The public launch itself waits (below).
- **CI minutes** (2026-10-01, D46): documentation-only changes run no CI, and `main` no longer repeats the tests its pull request passed.
- **M4b, member accounts** (2026-10-02, D48; its design, D49, approved by the operator on 2026-10-02): sign-in with Google, ORCID or an email link; saved positions; the newsletter choice and preferred subfields; data download and account deletion; the clean-up of inactive accounts; the data-request form. New with this task: an account without an email address is told that we cannot warn it before an inactivity deletion.
- **M2's technical parts** (2026-10-02 to 2026-10-05, D50), everything of M2 that needs neither the mailbox nor the lawyer:
  - **listmonk**, the newsletter software, on the server: reachable only inside it (no web address; its admin through an SSH tunnel), set up from the repository, in the nightly backup and the monthly restore test.
  - **The Glia Notes signup** at `/en/newsletter/`: the unticked consent box, a confirmation link valid 7 days, "Check your inbox" with "Send it again", the welcome email, and unsubscribing with one click from the email or one button on a page. An address reaches listmonk only once it is confirmed; until then it waits in our own database, for 7 days at most.
  - **The consent record**: when someone asked, confirmed and unsubscribed, with the date of the consent text, and never the address.
  - **Members**: the account's Glia Notes switch now subscribes and unsubscribes in listmonk; deleting an account on purpose, or a confirmed deletion request, ends the subscription; an inactivity deletion does not (decided 2026-10-02).
  - **The M2 state of the site**, prepared and tested but switched off: one setting gives the reduced header and footer, the coming-soon text on `/en/`, email in place of the suggest and report forms, and opens only the approved public pages without the password.
  - **Smaller items**: the cap on emails is a setting, the server's logs are kept 14 days, and backups can email their result once a mailbox exists.
  - **The legal drafts** describe all of this as built. They are still drafts.
- **The server check** (2026-10-07): every 15 minutes the server looks at its disk space, its memory and the site's certificate, and reports a problem by email, the way the backup emails go (so from M2, once the mailbox exists; until then the server's journal keeps the lines). A problem is reported once it has lasted two checks, then once a day while it lasts.
- **Two more legal drafts** (2026-10-07): the accessibility statement (`/en/legal/accessibility/`) and the sources and editorial policy (`/en/about/sources/`), in English, linked in the footer. Both are drafts; their open points are C6–C12 (the operator's) and B21–B22 (the lawyer's) in `docs/legal-open-questions.md`.

## Live now

- Everything runs on the production server, **behind the site-wide password**, except `/health/`. Nobody outside can see it yet.
- Every merge to `main` whose CI passes is deployed by itself, about 5–10 minutes later (until M2, D43).
- **The server has this task's files since 2026-10-05**: Caddy keeps the sign-in, account, data-request and newsletter links' codes out of its logs; listmonk runs, with no subscribers; backups hold both databases.
- **Nothing sends email and nothing is public**: there is no mailbox yet, so sign-in by email link, the data-request form and the Glia Notes signup say they are not available; the site's stage is `private`.
- **Sign-in is still off**: the Google and ORCID keys are not set.
- No real positions yet, so the home page's figures read 0.
- **CI minutes**: this task used about 205 of October's 2,000 (a code pull request about 19–27, a merge to `main` 6–7, a deploy 2, documentation 0). Check github.com/settings/billing; if the free minutes run out, CI and deploys stop until the next month.

## Open decisions and waiting items

- **M2's design (D50)**: the operator reviews it. The points are listed part by part in PLAN §20 ("M2 notes", each "Points for review") and summed up in the D50 row of §22.3. For example: listmonk has no web address of its own; an account takes over a newsletter subscription its address already had; the newsletter goes public only once the açık rıza metni is approved; the backup emails come on every failure and once a week on success.
- **listmonk's admin password**: generated on the server, readable only by root. Save it in the password manager: `ssh -t gliagora@45.144.214.78 sudo cat /root/listmonk-admin-password` (user `gliagora-admin`; `deploy/README.md` section 11 shows how to open the admin).
- **A weakness found in listmonk** (its `subscribers:sql_query` permission lets a token read any of its tables): our setup does not use it. Whether to tell listmonk's authors is the operator's decision.
- **Lawyer review** (`docs/legal-open-questions.md`), before M2; this task added points to B10, B11, B14 and B19 ("Added with M2's technical parts"). All legal texts stay drafts until the operator approves them; `docs/m2-links-review.md` shows how each text's links read in the M2 state.
- **Real sign-in**: register the Google and ORCID apps (steps in `deploy/README.md`, section 9). The first ORCID sign-in shows whether ORCID works with our safety checks.
- **For M2 itself** (in order; the report of this task has the details): a mail provider in Türkiye and its DNS records; the `SMTP_*` settings on the server; the lawyer's answers and the operator's approval of each text; the switch (`deploy/README.md` section 13); then release-tag deploys.
- **The Turkish strings** added by this task are drafts for the native speaker's review (`docs/tr-strings-review.md`).
- **The public launch** (M6: at least 150 verified positions in at least 25 countries, and the pre-launch checklist in PLAN §20) starts only when the operator says so. Entering the first 150 positions is postponed by the operator.
- **The poster's anatomy**: Nuray checks it later; nothing to do until she comments.

## Next step

The one-time lawyer review, then M2 (the mailbox, the approvals and the switch). Nothing starts before the operator says so.
