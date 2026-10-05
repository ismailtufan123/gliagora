# Next task

Status: **done** (2026-10-05; pull requests #73–#78: #73 the M4b decisions, #74 listmonk and the server's parts, #75 the M2 state, #76 the Glia Notes signup, #77 members' Glia Notes and the legal drafts, #78 the journal's fix and the wrap-up; the three server steps of section 2 done on 2026-10-05)
Written: 2026-10-02, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: the M4b decisions, the server steps, then M2's technical parts behind the password

Start by reading `CLAUDE.md`, `docs/STATUS.md` and, in `PLAN.md`: §5.1 (`ConsentLog`), §9.10, §13, §18, the M2 row and the M4b notes in §20, and D32, D39, D41–D43, D48 and D49.

### 1. The operator's decisions on M4b

Record these in `PLAN.md` and `docs/STATUS.md` in a first pull request that touches only documentation, so it runs no CI. The account-page notice and the changes to the privacy drafts go into a code pull request of this task, since `content/` runs CI.

1. **D49 is approved as built**, with every point the M4b notes list under "Open points". Record the approval, with the date, in the D49 row and the M4b notes.
2. **One addition:** a member without an email address (ORCID only, or Google with an address Google does not manage) is told on the account page that we cannot warn them before their account is deleted after 24 months without activity, and that adding an address lets us warn them (and lets them join Glia Notes). The privacy drafts say the same if they do not yet.
3. **Open question 11 is answered: no.** Deleting an account for inactivity does not end its newsletter subscription, which keeps its own consent record and unsubscribe link. Deleting the account on purpose, or a confirmed data request, ends it (`eraseNewsletter()`), as built. Mark the question resolved in §22.2 and say it in §13; the privacy drafts follow.

### 2. On the server: the operator's go-ahead, for these steps only

The operator gives the go-ahead (`CLAUDE.md`, rule a) for exactly these server steps. Explain each destructive command before running it, never print a secret, and report what changed.

1. **First, before anything else on the server:** copy the M4b deploy files as `deploy/README.md` step 9.1 says (`Caddyfile`, `compose.prod.yml`, `backup/backup.sh`, `backup/restore.sh`, checked against `main`). Then run `update.sh --no-pull` (it backs up first), restart Caddy, and check that the access log shows `/en/sign-in/?[removed]`.
2. **Then** remove, once, the unnamed Docker volumes that earlier restore tests left (step 7). List them with their creation dates first. Then run `restore.sh test latest` with the new script and check that it leaves no new volume.
3. **Later in this task:** put the deploy files this task changes on the server the same way: listmonk and its database, the backup changes, the container-log limit and the backup alerts (section 3). Generate the settings listmonk needs on the server, into `/opt/gliagora/.env` or a file only root can read, without showing them (D42). Then check that the stack is healthy, that the backup and the restore test include listmonk's database, and that everything stays behind the site-wide password.

Not allowed in this task:
- any Google, ORCID or `SMTP_*` setting;
- DNS records (no new subdomain);
- `hello@` routing;
- `DEPLOY_AUTO`, which stays `main`;
- opening any path from the site-wide password.

### 3. M2's technical parts, behind the password (new decision D50)

At the operator's request, the parts of M2 that need neither the mailbox nor the lawyer are built now, behind the site-wide password, as M5, M6's home page and M4b were (D45, D48). Record this as D50, with your design choices for the operator's review as D49 had them, and update the milestone-order note in §20.

Nothing goes public and no real email is sent: build and test with Mailpit and fake data only. Production keeps working without the new settings: each feature stays off until its settings exist, as sign-in does (D48).

1. **listmonk** (the current stable release, pinned by digest, unmodified):
   - Give it its own database and role in the shared PostgreSQL. The init scripts run only on an empty volume, so the existing server needs another way, kept in `deploy/`.
   - Make it reachable only inside the server: no public route and no subdomain. Its admin is reached through an SSH tunnel; explain how in the runbook.
   - Take its settings from the repository (a script or its API), so the server can be rebuilt from `deploy/`.
   - Add it to the nightly backup and the monthly restore test, and to local Docker Compose and CI for the tests.
2. **The signup** (§9.10, §13):
   - `/en/newsletter/` with the unticked consent box, and with the hint giving the minimum age (16) and the links to the privacy texts, as on the suggest form.
   - The shared public-form parts: ALTCHA, the hidden field, the rate limits and the email budget.
   - Double opt-in with a 7-day link; "Check your inbox" (resend after 60 seconds); "Confirmed".
   - A welcome email that says the first issue comes with the launch (D41).
   - Unconfirmed addresses are gone after 7 days.
   - Preferred design: our app owns every page and email a subscriber sees, and listmonk holds only confirmed subscribers (so it never stores an unconfirmed address) and later sends the issues. If listmonk's own opt-in proves simpler and as safe, explain why in D50.
3. **Unsubscribe:**
   - One click from every newsletter email, with `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058).
   - A page that works without JavaScript and without signing in.
   - It takes effect at once, and the address is deleted then (§18.1).
   - listmonk's issues use the same route later (M6, M11).
4. **Consent log** (`ConsentLog`, §5.1, §18.1):
   - It records requested, confirmed and unsubscribed, with the consent text's version (D28), the time and the source form, and no email address.
   - It is hidden like the member collections, and unlinked when the person deletes their data.
   - Adjust §5.1 in the same change if the design needs it.
5. **Members** (D49): sync the stored digest choices to listmonk with their `ConsentLog` rows (`source: account`), make `eraseNewsletter()` real, and add the notice from 1.2.
6. **The M2 state, prepared but switched off.** One setting gives:
   - the reduced header and footer (public pages only, no Account link);
   - the coming-soon text on `/en/` again (`home.comingSoon`, `home.writeToUs`);
   - email (`hello@gliagora.com`) in place of the links to the suggest and report forms (D41);
   - sitemaps and robots rules with only the public pages.

   The pages are built in CI, so choose how the setting reaches the static pages, and explain the choice.

   Then design how the private sections stay private once these pages are public (D39 left this to M2). Decide which paths Caddy opens (the coming-soon page, the newsletter pages, About, the approved legal texts, the data-request page with its form, and the assets they need) and how, all in one place, tested in CI. Write the steps of the switch into `deploy/README.md`.

   Test it locally and in CI, but do not switch it on: on the server, every path stays behind the password and the site stays as it is.
7. **The smaller M2 items that need no mailbox:**
   - the site-wide email cap as a setting, to be set from the mailbox's limit;
   - a 14-day time limit for container logs (D34);
   - backup alerts by email (D42), ready to start once SMTP is set.
8. **Texts:**
   - new strings in both locales (Turkish drafts) and `pnpm tr:review`, with the strings public at M2 first (D47);
   - the legal drafts updated with what was built (still drafts);
   - new lawyer points in `docs/legal-open-questions.md`.

Not in this task:
- the mailbox, SPF, DKIM, DMARC and the MX move;
- Umami;
- the archive and the issue builder (M11);
- the second backup location;
- release-tag deploys;
- going public.

### 4. Report

One short report at the end, in plain language:
- what was done on the server and what you checked;
- D50's points for the operator's review;
- what the operator needs for the switch to public at M2, in order:
  - what to ask a Turkish mail provider for (SMTP submission, sending limits, DKIM, return path);
  - the DNS records;
  - the settings;
  - the legal approvals;
  - the steps of the switch;
- the CI minutes this task used.

### Working rules

As in `CLAUDE.md`: one pull request per step, reviewed and merged when the checks pass. CI minutes are limited (D46), so:
- run every check locally before pushing;
- put documentation into the same push;
- aim for at most six code pull requests.

Stop and ask only for rules (a) to (c), apart from the server steps approved in section 2.
