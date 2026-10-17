# Next task

Status: **done** (2026-10-17; pull requests #96, #97, #98, #99)
Written: 2026-10-17, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: the newsletter builder (M11) and the subfield introductions

Start by reading `CLAUDE.md`, `docs/STATUS.md` and, in `PLAN.md`:
- §2.2 (the newsletter archive), §3.2 (the newsletter builder) and §5.1 (`NewsletterIssue`);
- all of §13, and §4.2, §15.1 (the AI assistance row) and §16.3;
- D3, D16, D19, D20, D39, D40, D41, D50 and D52, and the M2 and M7 notes in §20.

### 1. The operator's decisions (first pull request, documentation only)

Record these as **D53** (decided 2026-10-17):

1. **M11 comes forward.**
   - **Why now:** at the operator's request, M11 (the newsletter builder) is built now, ahead of M8–M10 and behind the site-wide password, as M5, M6's home page, M4b and M2's technical parts were (D45, D48, D50). The first issue is the launch issue (D41), so the builder must be ready for it.
   - **What an issue holds:** only the sections whose windows exist, which now means the deadlines and the selected positions. Papers, funding, news and Learn join when their milestones are built.
   - **Nothing is sent before the launch:** pushing an issue to listmonk stays off (a setting) until the operator switches it on at the launch.
   - **The plan:** update the milestone order in §20.
2. **A hub introduction may start from an AI draft** (§16.3, which said "human-written", changes).
   - **The draft:** it is kept in its own field that only editors see, and it is never shown on the site.
   - **What the site shows:** only the introduction the editor writes from the draft. She edits and approves each one, and holds editorial responsibility for it, as for listings (D3, D52).
   - **The policy:** the sources and editorial policy draft says so (§15.1, AI assistance).

Also record that the About page's section "Reading employers' pages" is approved as written (2026-10-17), in the M7 notes and in `docs/STATUS.md`.

### 2. The newsletter builder (M11)

- **Issues** (`NewsletterIssue`, §5.1): an admin collection for editors.
  - One issue a month. Its date is by default the next first Tuesday, at 13:00 UTC (D16).
  - An issue has a subject, a preheader, an opening note of 2–3 sentences that the editor writes, and sections filled from published items:
    - **Deadlines:** the positions whose deadlines fall in the next 45 days.
    - **Selected positions:** 10–15 positions that the builder proposes, balanced by subfield and region. The editor reorders, removes or adds them.
- **The email** (React Email, §11.3, in the format of §13):
  - 600px, one column, system fonts, colours that stay readable in dark mode, and alt text;
  - a plain-text part made from the same data;
  - HTML under 100 KB, checked by a test;
  - links to employers' pages without tracking parameters, and UTM tags only on links to our own pages;
  - no tracking pixel, and listmonk's own tracking switched off;
  - the footer of §13: why you get this, one-click unsubscribe, contact and legal notice, and the privacy links;
  - unsubscribing as M2 built it (§13), with each subscriber's own ID and UUID:
    - the visible link leads to `/en/newsletter/unsubscribe/?id=&s=`;
    - the `List-Unsubscribe` and `List-Unsubscribe-Post` headers point at `…/unsubscribe/use/?id=&s=`.
  - **A known problem:** listmonk may not fill template values in a campaign's own headers, and its built-in header points at listmonk's own address, which no one can reach. Check how listmonk v6.2 behaves, choose the safe way to fill the headers, and explain your choice in the report.
- **Preview and test send:**
  - a preview in the admin, both HTML and plain text;
  - a test email through the app's mail path, to the signed-in editor's own address and to §13's seed addresses (a setting). It uses Mailpit locally, and works on the server only once `SMTP_HOST` is set.
- **listmonk:**
  - **The campaign:** the editor pushes an issue to the Glia Notes list as a campaign, either as a draft or scheduled for the issue's date. Nothing goes out without an editor's explicit action.
  - **What the app records:** `listmonkCampaignId`, then `sentAt` as listmonk reports it.
  - **Permissions:** grant only the campaign permissions this needs, through a separate API user if that keeps each user narrower. Never grant `subscribers:sql_query`.
  - **Sending rate:** derive it from settings based on the mailbox's limit, which is unknown until M2's mailbox exists. Leave room for the forms' emails (`EMAIL_CAP_*`, D50), and document how the two share the limit.
  - **Off until the launch:** keep pushing switched off (D53), so that no issue can reach people who subscribe at M2 before the launch issue.
- **Archive:** `/en/newsletter/archive/` and `/en/newsletter/{yyyy-mm}/` show sent issues from the same record, with nothing about any subscriber.
  - They are indexed once public.
  - Until the launch they stay private, like the jobs (D39), so they are not in M2's public list.
- **The launch issue:** prepare it so the editor can make it in minutes on launch day (D41), with a draft of its opening note for her to edit.
- **Editor guide:** add a section on making an issue to `docs/editor-guide-tr.md`.
- **Tests:**
  - the email's rendering, size, links and headers;
  - the push to listmonk (CI has listmonk);
  - the test send through Mailpit;
  - the new collection in `tests/e2e/access.spec.ts`;
  - the archive pages in `tests/e2e/pages.ts`.

### 3. The subfield introductions (D53)

- **The drafts:** write an English introduction of 170–250 words for each of the 19 subfields in §4.2. Indexing counts 150 words (D40), so the range leaves Nuray room to shorten.
  - **Who reads them:** researchers looking for positions, events and funding in that field.
  - **What they cover:** what the field studies, its typical questions and methods, the kinds of positions it offers, and its related subfields.
  - **How they are written:** plain British English, in our own words, with no names of people or labs, no medical advice (D19), and no claims that would need a source.
- **Where Nuray reviews them:** a new field on each subfield, "AI draft of the introduction".
  - Only editors see it, and it never reaches a public page (field access, and the public queries leave it out).
  - A migration fills it where it is empty, as M7 seeded the sources, so the drafts arrive with an ordinary deploy.
  - The site shows, and indexing counts, only "Hub introduction". It stays empty until Nuray writes hers from the draft and saves it.
  - Update that field's description, which says "Human-written", to match D53, and add the steps to the editor guide.
- **A readable copy:** put the 19 drafts, each with its word count, in `docs/subfield-introductions.md`, with the same texts as the migration's data.
- **English only:** Turkish introductions come later.

### On the server

- **Nothing by hand:** the app's changes, and the drafts' migration, arrive with the usual deploys.
- **listmonk's settings:** the changes to `deploy/` reach the server later, with M2's steps. Until then, pushing to listmonk stays off there anyway.

### Not in this task

- the windows of M8–M10;
- sending any issue, and any real email;
- the Claude API and its key;
- Turkish hub introductions;
- the UI/UX pass.

### Report

At the end, one short report in plain language:
- **For Nuray:** how she makes an issue, step by step, and how she turns a draft into a hub's introduction.
- **A sample issue:** made from the fake data, in the pull request, with its size.
- **The unsubscribe headers:** the way you chose, and why.
- **The introductions:** their word counts, and anything Nuray should check in particular.
- **CI minutes:** how many this task used. About 675 of October's 2,000 are left; if fewer than 150 remain before a code pull request, stop and tell the operator.

### Working rules

Follow `CLAUDE.md`:
- one pull request per step, merged when its checks pass;
- CI minutes are limited (D46), so run every check locally before pushing, and put documentation into the same push;
- stop and ask only for rules (a) to (c).
