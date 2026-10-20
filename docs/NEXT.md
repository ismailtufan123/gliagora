# Next task

Status: **done** (2026-10-21, #107: the review in `docs/ui-review/2026-10/review.md`, 17 fixes and the operator's decisions D54–D58)
Written: 2026-10-18, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: the UI/UX pass

**When:** now, at the operator's request (2026-10-18). Finish by the end of 2026-10-19 if you can.

**Parked:** the rest of M7's second round, which starts on 2026-10-20, is parked. Its text is this file as of #105. Do not start it: the planning chat puts it back here after this task. Say so in `docs/STATUS.md`.

**Why:** the site goes public in two steps: M2, then the launch. It is built and tested, but no one has yet looked at it as a whole, the way a visitor would. The operator wants it to look and work as well as it can before then.

Start by reading `CLAUDE.md`, `docs/STATUS.md` and, in `PLAN.md`:
- §7, the design system, especially 7.1 (the principles) and 7.6 (the template habits to avoid);
- §8 (the references) and §9 (the wireframes);
- §17 (accessibility and performance, with §17.3's budgets);
- D45 and D47.

### 1. Look at the site as a visitor would

- **Run it locally with the fake data** (`pnpm fake:jobs`), in two forms: the full site, and the M2 state (`SITE_STAGE=m2`).
- **Screenshots:** take each one on a phone (390 px wide) and on a desktop (1440 px), in light mode and in dark mode. Cover:
  - the home page;
  - the jobs list: with the filters open, with chips, and with no results;
  - a job page: open, closing soon, and closed;
  - the map, an institution page, a subfield hub and search;
  - the suggest and report forms, also with their errors;
  - sign-in and the account pages;
  - the newsletter pages;
  - About and one legal page;
  - the 404 and 410 pages;
  - the M2 state: the coming-soon page, the newsletter signup and About, with the reduced header and footer and their phone menu;
  - the Glia Notes sample issue (`docs/glia-notes-sample/`).
- **Five tasks:** walk through each on a phone and on a desktop, and note every friction:
  1. A first-time visitor understands what Gliagora is and finds positions in their field.
  2. Find PhD positions in one subfield in Europe whose deadline is within a month.
  3. Read a job page, then go on to the employer's posting.
  4. Save a position, then find it again in the account.
  5. Sign up for Glia Notes.
- **The admin:** look at the editor's two most frequent flows, deciding a candidate and publishing the job made from it. Count the clicks and the fields in each.
- **A fresh eye:** before you add your own findings, have an independent reviewer that has not read the code look at the screenshots and walk through the five tasks.

### 2. The review

- **Where:** `docs/ui-review/2026-10/review.md`.
- **Each finding gets:**
  - its screenshot;
  - the principle it touches: hierarchy, spacing, contrast, consistency, affordance, feedback, mobile ergonomics or wording, or §7.1 and §7.6;
  - a priority:
    - **P1:** a visitor gets something wrong or cannot do it, or something looks broken;
    - **P2:** a clear gain in clarity or polish;
    - **P3:** nice to have.
- **Screenshots in the repository:** keep only those the findings need, each under 150 KB (PNG or JPEG), in `docs/ui-review/2026-10/`.

### 3. Fix

- **What:** every P1 and P2 finding that stays within the design system and the budgets. Group related fixes into a few pull requests, to save CI minutes, and add an "after" screenshot for each fix.
- **Within the design system means:**
  - the tokens (colours, type sizes, spacing and radii);
  - the two typefaces;
  - the logo files as given;
  - §7.6's list of template habits to avoid.
- **Budgets:**
  - **The jobs list:** it has about 0.26 KB of its 137 KB JavaScript cap left (D47), so fix it with CSS and server-rendered markup.
  - **Every page:** keeps its §17.3 budget and Core Web Vitals "good" (`pnpm lighthouse:local`).
  - **Tests:** all existing tests pass, among them axe, the layout at 200% and 320 px, and the pseudo-locale.
- **Wording:** English interface text lives in `messages/en.json`. Keep the Turkish keys in step, and run `pnpm tr:review` so the native speaker can review the new Turkish strings.

### 4. Proposals for the operator

- **What counts as bigger:**
  - a change of layout or of visual direction;
  - a new component;
  - a change to a §7 token, to the §9 wireframes, or to the home page's structure.
- **How to propose it:** write each one in the review, with:
  - a mock-up: a screenshot from a local branch, or a sketch;
  - what it costs in time, budget and CI minutes;
  - your recommendation.
- **The operator decides:** ask in the session which ones to build, then build those the operator approves. Record each design decision as D54 onwards.

### On the server

- **Nothing by hand:** the fixes arrive with the usual deploys, behind the password.

### Not in this task

- the rest of M7's second round (parked, see above);
- the signature hero (M13) and the poster's art (`tools/poster`), though proposals are welcome;
- new windows (M8–M10), and Umami;
- any change to an approved legal text.

### Report

At the end, one short report in plain language:
- **The five tasks:** what was hard before, and what changed;
- **The findings by priority:** which were fixed, which are proposed and which are left;
- **Before and after:** the screenshots of the main changes, with their paths in the repository;
- **The operator's decisions:** if any were made;
- **Budgets:** the jobs list's JavaScript and the Lighthouse scores, before and after;
- **CI minutes:** how many this task used. About 515 of October's 2,000 are left; if fewer than 150 remain before a code pull request, stop and tell the operator.

### Working rules

Follow `CLAUDE.md`:
- one pull request per step, merged when its checks pass;
- CI minutes are limited (D46), so run every check locally before pushing, and put documentation into the same push;
- stop and ask only for rules (a) to (c), and for the proposals of section 4.
