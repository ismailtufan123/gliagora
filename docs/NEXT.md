# Next task

Status: **open**
Written: 2026-10-06, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: the D50 approval, then the technical items of the pre-launch checklist

Start by reading `CLAUDE.md`, `docs/STATUS.md` and, in `PLAN.md`: §3.4, §15.4, §17, §18.2, the pre-launch checklist in §20, and D42.

### 1. The operator's decision on M2 (first pull request, documentation only)

**D50 is approved as built** (2026-10-06), with every "Points for review" in the M2 notes. Record the approval, with the date, in the D50 row, the M2 notes, `CLAUDE.md` ("its design waits for the operator's review") and `docs/STATUS.md`.

### 2. Rate limits in Caddy (D42, pre-launch checklist)

- **The image:** build a Caddy image with a rate-limit module, for example `github.com/mholt/caddy-ratelimit`. Pin the versions, keep Caddy at the version in production, build it in CI only when its inputs change, push it to GHCR, and pin it by digest in `deploy/compose.prod.yml`. The tests' Caddy (`CADDY_BIN`) is the same build.
- **What it limits:** requests per client address (IPv6 by its /64), for:
  - the editors' sign-in and password routes under `/admin` and `/api`;
  - the member sign-in routes (start, callback, email link);
  - the forms' POSTs (suggest, report, data request, Glia Notes signup and "Send it again");
  - search (`/en/search/` and the jobs list's `q`).
- **How:** limits generous enough that normal use never meets them. A request over the limit gets `429` with `Retry-After` and a plain page. Log nothing about visitors beyond what Caddy logs today.
- **Tests:** test the limits with the production Caddyfile in front of the app, as the M2 tests do.

### 3. Lighthouse against the deployed site (§17.2, §17.3)

- **The script:** add `pnpm lighthouse:prod`, which runs Lighthouse with the §17.3 budgets and the Core Web Vitals lab targets on the main templates of `gliagora.com`, desktop and mobile. Run it from the operator's computer, not in CI, to save minutes. Record that in §17.2 and the pre-launch checklist.
- **The site-wide password:** it reaches the run only piped from the server. Never show it, store it or write it to a file or log (D42, `CLAUDE.md`). Lighthouse writes its settings, extra headers included, into its reports, so make sure no report holds the credentials.
- **Empty lists:** the server has no positions yet, so its lists are empty. Measure the list templates locally too, with the fake data (`pnpm build && pnpm start`).
- **Results:** report the scores per template. Fix what fails, or explain why it cannot be fixed.

### 4. Monitoring emails (§18.2)

- Add alerts for low disk space, memory pressure and a certificate close to expiry. Use the same `alert.sh` path as the backup emails, so they start once `SMTP_HOST` and `ALERT_EMAIL` are set.
- Give each alert a sensible threshold, and make sure no alert repeats every few minutes.

### 5. Two legal drafts (§15.4)

- **The texts:** write the **accessibility statement** and the **sources and editorial policy** in English, as drafts (`draft: true`). List them in `src/lib/content.ts` and link them where the plan says. Mark open points `[TO DECIDE: …]`, and add any lawyer points to `docs/legal-open-questions.md`. Never approve them.
- **Accessibility statement:** describe what the site is tested against and how, as it is today. §15.4 says WCAG 2.1 AA, while the tests already cover some 2.2 criteria. Include the known issues, a contact and a response time.
- **Sources and editorial policy:** the automation policy in §6.1 may change soon, because the operator is considering automatic checks of employers' career pages (M7). Describe today's rule and mark that part `[TO DECIDE: …]`.

### On the server: the operator's go-ahead, for these steps only

The operator gives the go-ahead (`CLAUDE.md`, rule a) for exactly these steps:
- put the new Caddy image and the deploy files of sections 2 and 4 on the server, the same way as before (`update.sh` backs up first);
- check the stack from outside afterwards;
- read the site-wide password on the server only to pipe it into the Lighthouse run.

Explain each destructive command before running it, never print a secret, and report what changed. If Claude Code's permission check blocks a server command, ask the operator in the session for an explicit approval naming the command and the server.

Not allowed in this task:
- any Google, ORCID or `SMTP_*` setting;
- `SITE_STAGE`;
- DNS;
- `hello@` routing;
- `DEPLOY_AUTO`;
- opening any path from the site-wide password.

### Not in this task

- **Umami:** its tracker adds JavaScript to every page, and the jobs list has only 0.26 KB of its cap left. The operator decides on the budget first.
- **People's checks:** the real-device check and the screen-reader walkthrough.
- **The external uptime monitor:** it is a new vendor.
- **The restore drill.**
- **Everything that waits for the mailbox or the lawyer.**
- **M7 (automating the search for positions):** the planning chat is preparing a proposal for the operator. Do not start it.

### Report

One short report at the end, in plain language:
- the Lighthouse scores per template, and what was fixed;
- the rate limits chosen, and how they were tested;
- what changed on the server, and what you checked;
- the CI minutes this task used.

### Working rules

As in `CLAUDE.md`: one pull request per step, reviewed and merged when the checks pass. CI minutes are limited (D46), so run every check locally before pushing and put documentation into the same push. Stop and ask only for rules (a) to (c), apart from the server steps approved above.
