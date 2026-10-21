# Next task

Status: **done** (2026-10-21; #110 and #111)
Written: 2026-10-17, by the operator's planning chat (Claude) on the operator's behalf. Parked on 2026-10-18 for the UI/UX pass, and put back on 2026-10-21 once that pass was done (#107, #108).

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: better candidates and more sources (M7, second round)

**When to start:** now. The run records (`source-runs`, kept since 2026-10-18) should hold at least four daily runs. If they hold fewer, stop and tell the operator.

**Progress:** the parts that need no run data were done on 2026-10-17 (#101–#104), at the operator's request: section 1, sections 3 and 4, and the report route of section 2. What remains:
- section 2's findings;
- section 5's steps on the server;
- the operator's decisions in section 6.

**Why this task:** the launch gate (§3.4) needs at least 150 active verified positions in at least 25 countries. Most positions come through the monitors, and Nuray's time goes to the review queue and to the manual sources. This task makes the candidates better and more numerous, and shortens the manual list.

Start by reading `CLAUDE.md`, `docs/STATUS.md` and, in `PLAN.md`:
- all of §6, §3.4 (the launch gate) and D52;
- the M7 notes in §20, with "Seen on the way";
- the M11 notes in §20 (for the approval below).

Then read `docs/sources/sources-2026-10-16.csv`.

### 1. The operator's decisions (first pull request, documentation only)

- **M11 is approved:** the operator approved M11's design as built (2026-10-17), with every point for review in the M11 notes and the accepted risk of the campaigns user. Record it the way D50's approval was recorded: in D53's row, in the M11 notes and in `docs/STATUS.md`.
- **Umami:** the operator will decide later (asked on 2026-10-17). Leave it open.

### 2. Look at the results (on the server, read only)

- **A report route:** build a read-only operations route, like M7's, and keep it for later rounds. It reports on the daily runs so far:
  - **per source:** runs, failures and their kinds, postings seen, candidates made, and postings skipped by reason (not neuroscience, closed, duplicate, the cap of 40);
  - **per candidate:** ID, source, redacted title, status and the editor's reason if one was given, whether a deadline and a type were found, and the suggested subfields;
  - **per skipped posting:** its redacted title and outcome from `source-postings`, so that wrongly skipped neuroscience postings can be found.
- **What it must never return:** the candidates' text, people's names or addresses, or anything about members.
- **Your judgement:** after its deploy, call it on the server (the go-ahead is below) and find:
  - which candidates are not neuroscience, and which are old or filled;
  - which sources fail, and why;
  - which neuroscience postings were skipped wrongly.

### 3. Better candidates

- **False positives:** the employer's own name or department must not satisfy the neuroscience check. Karolinska's "Clinical Neuroscience" appears in every one of its ads. Choose the way, for example leaving the employer's and the unit's names out of the text that is checked, or a setting per source.
- **Old "open until filled" posts:** RIKEN CBS lists posts from 2025. Skip a posting that has no deadline and was published long ago, or mark it for the editor as possibly filled. Choose the age limit and say why. Show the posting's date wherever the source gives one.
- **Failing sources:** fix what can be fixed, and flag the rest with the reason.
- **Names in Chinese, Japanese or Korean script:** redaction cannot find them (M7 notes). A list that names people that way stays manual unless the employer has a list in English.
- **Fast decisions for Nuray:** let her reject several candidates at once, from the list, with a reason such as "Not neuroscience". If Payload's own bulk edit already does this, document it in the editor guide; otherwise add the smallest way to do it. Count the rejections per source, so the next round has data.
- **Tests:** test each rule with fake pages. No request may leave the computer.

### 4. Fewer manual sources, more sources

- **Adapters:** write small adapters for the sources M7 saw could be read that way ("Seen on the way"):
  - the Workday sites whose robots.txt names a sitemap of posting pages: HHMI, CSHL, McGill, UBC, DZNE, Helmholtz Munich and EMBL;
  - Oxford's CoreHR lists;
  - Janelia.

  M7's rules apply: robots.txt and the terms of use, one request at a time, and never a headless browser. A source whose terms forbid automated reading stays manual.
- **New employers:** research about 40–60 more from their own official sites.
  - **Where:** above all countries that have no automatic source yet, Türkiye among them.
  - **Which:** prefer employers whose lists can be read automatically. Add a manual one only when it is the only good source for its country.
  - **Rules as in M7:** each source gets its terms and the reason for its kind, and job boards are never sources.
  - **How:** add them with a migration, with "Monitor on" unticked, and update the sources CSV.
- **The manual list:** set the manual sources whose lists rarely change to "Monthly", so the dashboard asks Nuray less often. Say which ones in the report.

### 5. On the server: the operator's go-ahead, for these steps only

- **The report:** call the read-only route of section 2 as often as the task needs.
- **A run by hand:** after the deploy, run the changed sources and the new ones, a few at a time, through `/api/ops/monitors/run/`. Also check from the server whether the Hebrew University's hosts answer (M7 notes).
- **Switching on:** switch on the new automatic sources whose run by hand had no failure, through `/api/ops/monitors/switch-on/`.
- **Nothing else:** make no other change on the server, and never print a secret.

### 6. The operator's decisions on terms (2026-10-18)

These settle open points 2 and 3 of the second round's notes (PLAN §20). Record them there, in `docs/STATUS.md` and in the sources CSV.

- **NUS and Duke-NUS are left out.** The planning chat read NUS's legal notice on 2026-10-18 (`https://www.nus.edu.sg/legal-information-notices`).
  - **What it says:** "Deep linking to NUS web pages is prohibited". It allows a copy only for one's own information, research or study, unmodified.
  - **Why this rules them out:** our listings link to the posting's own page, which the notice forbids, as with LIH and KEMRI-Wellcome. Both sources live on careers.nus.edu.sg.
  - **Their records:** keep them with this reason, so that no one adds them again, and never switch them on.
- **UCSF and UC San Diego become manual.** The University of California's shared wording allows only "one copy for personal use", which restricts storing content. The operator decided the same for Radboud, ETH Zurich and Tübingen on 2026-10-16.
  - **UCSF:** its automatic source has been on since 2026-10-16. Switch it off and make it manual. A migration is enough, so this needs no step on the server.
  - **UC San Diego:** add it as a manual source.
  - **Later:** look at both again once the lawyer has answered B22.
- **These may be read automatically:** the operator reads their terms as allowing our use, since we keep only facts and a redacted text for the editor, and publish our own summary with a link.
  - Baylor and NTU, whose terms hold only general reservations, as RIKEN's did;
  - Aga Khan University (downloads for information only, which is our use);
  - Cinvestav (information only by the means it offers: we read its own feeds);
  - Glasgow, Basel and Gothenburg (internal or non-commercial copying: the site is non-commercial, so look again before any sponsorship, Phase 4).

  They are switched on like the other new sources, once their run by hand has no failure.
- **UBC stays manual.**
- **Three manual sources to add, on the monthly schedule:**
  - Hacettepe University's Institute of Neurological Sciences and Psychiatry (its ads are PDFs);
  - Üsküdar University and Sabancı University (their terms forbid automated reading, but an editor may read them).

  Check that their terms allow a link to a posting's own page. If one's terms do not, leave that source out and say so in the report.

### Not in this task

- a headless browser, and job boards;
- the Claude API and its key;
- Umami;
- more UI/UX work (the pass is done: #107, D54–D58);
- M8–M10.

### Report

At the end, one short report in plain language:
- **False positives and old posts:** how many before and after, and which rules changed;
- **Sources:** automatic and manual, before and after, and the countries that automatic sources now cover;
- **New employers:** listed by country;
- **The run by hand:** candidates per source, and any failures;
- **Nuray's week:** how many manual sources fall due each week, and about how many candidates arrive each day;
- **CI minutes:** how many this task used. About 490 of October's 2,000 are left; if fewer than 150 remain before a code pull request, stop and tell the operator.

### Working rules

Follow `CLAUDE.md`:
- one pull request per step, merged when its checks pass;
- CI minutes are limited (D46), so run every check locally before pushing, and put documentation into the same push;
- stop and ask only for rules (a) to (c), apart from the server steps approved above.
