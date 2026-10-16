# Next task

Status: **done** (2026-10-16; #87–#93). The monitors are switched on. One step waits: the rate limits on the server (the Caddy image's package is still private).
Written: 2026-10-16, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: M7, finding positions automatically (D52)

Start by reading `CLAUDE.md`, `docs/STATUS.md` and, in `PLAN.md`:
- §5.1 (`Source`, `Candidate`);
- all of §6;
- §15.2 (flag 6);
- §18;
- the M4 notes on the review queue, and the M7 row in §20;
- D3, D34, D40 and D51.

Then read `docs/sources/initial-sources.csv`, which this file's pull request adds: the planning chat's research of 70 employers in 30 countries (60 researched, 10 marked "not researched").

### 0. Left over from the last task: the rate limits on the server

The last task (D51, #80–#85) is done except one step: the rate limits are not on the server, because the package `gliagora-caddy` was private. In `docs/STATUS.md`, record the last task as done with that step carried over here.

At the start of this task, check whether `ghcr.io/ismailtufan123/gliagora-caddy` can be pulled without a login.
- **If it can:** do the steps of `deploy/README.md` section 16. The operator's go-ahead is given here: pull the image, check the Caddyfile with it, take a backup, restart only Caddy, and test a limit from outside.
- **If it cannot:** leave the step open in `docs/STATUS.md` and say so in your report. The operator makes the package public in GitHub when convenient; it is needed only once the site is public.

### 1. The operator's decisions (first pull request, documentation only)

1. **D51 is approved as built** (2026-10-16), with every point the D51 row lists. Record the approval, with the date, in the D51 row, the notes in §20, `CLAUDE.md` ("its design waits for the operator's review") and `docs/STATUS.md`.
   - Add to the pre-launch checklist: in the first month after the launch, check once a week how many requests got `429`, by zone and as counts only, never addresses.
   - Raise a limit if real people meet it. People behind one IPv4 address (a campus, a conference) share its counts.
2. **D52, M7's design as the operator decided it on 2026-10-07:**
   - **Employers' own careers pages may be checked automatically** (§6.1 changes).
     - **What may be read:** besides official feeds and APIs, a scheduled monitor may read the vacancy pages of employers (universities, institutes, companies), never job boards.
     - **How:**
       - at most once a day per source;
       - one request at a time per host;
       - a user agent that names Gliagora and links to a short section on the About page that explains it;
       - robots.txt checked before every run;
       - the source's terms of use followed. Each source records its terms address and the dates both were checked. A source whose terms forbid automated access stays manual.
     - **What is kept:** only what the review queue needs: the posting's address, its title, the facts the editor checks, and its source text until 30 days after the decision (D34).
     - **Publishing:** nothing is published without an editor (§6.3).
     - **Lawyer:** add the question to `docs/legal-open-questions.md`: database right, terms of use, and the basis for reading pages that name contact persons.
   - **AI drafts have two ways in.** Both work only on redacted text (§6.6), and neither shows anything on the public site. The KVKK risk is the one already accepted for the API (§15.2, flag 6).
     - **The Claude API:** built, but off until the operator sets a key and a monthly cap.
     - **At first, a weekly run by Claude Code on the operator's computer:**
       - an export of the new candidates from the server, with redacted text only;
       - drafts written by Claude Code, each saying what it came from: a summary in our own words of at most 280 characters, the position type, the deadline and its time zone, the place, the subfields and the career stage;
       - an import into the candidates' `aiSuggestion`, where the editor accepts or changes them.
     - **Record the routine:** a script, and an instruction the operator starts with one sentence ("Do the weekly drafts"), and the operator's standing go-ahead for exactly that export and import on the server.
   - **Start with the 70 employers** in the CSV (the operator asked for 50–80). More are added in the admin later.

### 2. Build

- **Sources** (§5.1 `Source`):
  - an admin collection with the kinds `rss`, `api`, `page` (an HTML list of vacancies) and `manual` (checked by the editor, with the source's link shown on the dashboard);
  - fields for robots.txt and the terms, the schedule, the source's health (last run, last success, errors, candidates found) and a note;
  - seeded from the CSV, each employer resolved to its institution (ROR, by domain or name).
  - **Complete the list:** fill in the rows marked "not researched" and the unknown fields from the official sites. Read each source's terms, and mark the source `rss`, `api`, `page` or `manual` from what you find. JavaScript-only lists, bot checks and terms that forbid automation become `manual` for now. Where neuroscience posts sit on a sub-unit's own page (for example SWC, IoPPN, Kavli, OIST units, Cambridge departments), add that page as its own source.
- **Monitors** (scheduled maintenance tasks, `maintenanceTask()`):
  - fetch the feed or page politely: timeouts, size limits, no cookies, no JavaScript;
  - find the posting links that are new since the last run;
  - read each new posting's page, where robots.txt allows, for its title, deadline and text; many lists keep closed posts, so the deadline counts, not the presence in the list;
  - keep the postings that match neuroscience by the taxonomy's synonyms (the local tag suggester, §6.3);
  - skip duplicates: the canonical address, existing candidates and jobs;
  - create candidates with status New, `source` set, a redacted `snippet`, and `extracted` facts that say where each came from;
  - one failing source never stops the others, and a source that fails three runs in a row is flagged for the editor.
- **Redaction** (§6.6): one function, used before anything is stored or exported. It removes email addresses, phone numbers, and personal names as far as rules can find them (titles such as Prof. or Dr., "X Lab", "contact X"). Unit-test it with fake examples.
- **Local tag suggester** (§6.3): proposes subfields, methods, model systems, position type and career stage from the title and text, by the taxonomy's synonyms and the matching rules in the M3 notes. The editor sees them as suggestions.
- **Link checker** (weekly, §6.3): checks every published job's original page. A removed page (404, 410), or one that says the position is filled or closed, goes on the dashboard for the editor; nothing is closed automatically.
- **Dashboard:** new candidates by source; sources that need attention (failing, robots.txt or terms changed, manual sources due for a look); the link checker's results.
- **The two AI ways** above: the export and import commands, tests (a round trip on fake data, and nothing but redacted text exported), and the instruction for the weekly run.
- **Editor guide** (`docs/editor-guide-tr.md`): sources, candidates from monitors, and AI drafts.

### 3. On the server: the operator's go-ahead, for these steps only

- **The rate limits** (section 0, only if the package is public).
- **The first run:** after the deploy, run the monitors once by hand on a few sources and check the candidates in the admin. Then let the schedule run. Nothing is published automatically.
- **The weekly AI drafts:** the export and import (a standing go-ahead).

Explain each destructive command before running it, never print a secret, and report what changed. If Claude Code's permission check blocks a server command, ask the operator in the session for an explicit approval that names the command and the server.

Not allowed in this task:
- any Google, ORCID or `SMTP_*` setting;
- `SITE_STAGE`;
- DNS;
- `DEPLOY_AUTO`;
- opening any path from the site-wide password.

### Not in this task

- monitors for events, funding, papers and news (M8–M10);
- a headless browser for JavaScript-only lists (later, if the manual list proves too long);
- the API key;
- job boards.

### Report

One short report at the end, in plain language:
- the sources, by kind;
- the first run: candidates found per source, false positives and failures;
- the editor's weekly routine, and the operator's weekly sentence;
- the rate limits: on the server, or still waiting;
- the CI minutes this task used. About 800 of October's 2,000 are left; if fewer than 150 remain before a code pull request, stop and tell the operator.

### Working rules

As in `CLAUDE.md`: one pull request per step, reviewed and merged when the checks pass. CI minutes are limited (D46), so run every check locally before pushing and put documentation into the same push. Stop and ask only for rules (a) to (c), apart from the server steps approved above.
