# Next task

Status: **done** (2026-10-22; pull requests #115, #116, #117, #118, #119 and #120)
Written: 2026-10-22, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: Claude Code publishes the jobs on the operator's command, with the fixes this needs

**Parked:** the lawyer packet, which is this file as of #113, waits. Do not start it; the planning chat puts it back after this task. Say so in `docs/STATUS.md`.

**Why:** the operator decided on 2026-10-22 that there is no editor at first: Claude Code publishes the listings when the operator asks. Nothing is published yet, and 331 candidates have AI drafts. The two weekly drafts runs of 2026-10-22 showed what must be fixed first:
- **Redaction:** it misses names.
- **Candidates:** many are not research positions, are closed, or carry the wrong institution or deadline.

Start by reading `CLAUDE.md`, `docs/STATUS.md`, `docs/weekly-drafts.md` and the editor guide's sections on candidates and jobs. Then read, in `PLAN.md`:
- all of §6, and §3.4;
- D3, D34, D52 and D53;
- the M7 notes in §20, all three rounds.

Read also `content/en/about.md` and `content/en/about/sources.md`.

### 1. The operator's decision (first pull request, documentation only)

Record it with the next free decision number (D59 if it is free).

- **Claude Code publishes on the operator's command.** This changes D3 and D52. When the operator says "Update the jobs" (in Turkish, "İlanları güncelle"), Claude Code:
  - drafts the waiting candidates;
  - checks each one against written rules;
  - publishes those that pass, rejects those that clearly fail, and leaves the uncertain ones for the operator with a question.
- **Nothing is published without the operator's command:** no automatic publishing, and the Claude API way stays off.
- **The operator holds editorial responsibility** and can change or remove any listing at any time, in the admin or by telling Claude Code.
- **Update the texts that describe the old way:**
  - PLAN §6.3 and §6.6;
  - the sources and editorial policy draft;
  - `docs/legal-open-questions.md`: in B17, or as a new question, ask whether listings chosen and summarised with AI, without a person checking each one, need a label (EU AI Act Art. 50), and what the texts must say.
- **The About page's approved section:** if a sentence in "Reading employers' pages" is no longer true, propose the new wording to the operator in the session. It is approved text.
- **The four suggestions still to discuss:** the operator wants to discuss four suggestions of 2026-10-22 (the UCSF and CEBSIT candidates, Hacettepe's and Üsküdar's schedule, UC Irvine, the three sources still off). Until they are settled, leave UCSF's and CEBSIT's candidates for the operator.

### 2. Redaction, second round

- **Names it missed:**
  - HR and union contact blocks with their phone numbers (Karolinska, Gothenburg);
  - recruitment advisers (Amsterdam UMC);
  - "Team Leader: …" and "Unit Leader: …" lines (RIKEN);
  - names inside lab names and web addresses (HHMI, UCSF);
  - the shortened personal names in CNRS offer references (UMRxxxx-ABCDEF-001);
  - SISSA's titles and document names.
- **Titles too:** redact the titles as well as the texts. In one posting the lab head's name was in the title.
- **Phone numbers:** they were left in 7 of the first 100 texts. Removing institutional lines as well is acceptable.
- **Email addresses:** one survived next to a full name. Check obfuscated forms such as [at] and (at).
- **Over-removal:** "Cold Spring Harbor", and ordinary capitalised words at the Allen Institute, were removed. Ordinary words should stay.
- **Tests:** add fake examples of every pattern, both those that must go and those that must stay.
- **Stored texts:** run the new rules over the stored text and title of every waiting candidate on the server (go-ahead below), and report how many changed.

### 3. Better candidates

- **Not research, or not neuroscience:** drop these by their title:
  - administrative jobs;
  - nursing;
  - clinical residencies and clinical-only posts;
  - teaching pools;
  - business roles (partnerships, project management).

  Then look at the settings of the sources that brought most of them: Champalimaud, Radboud, VIB, Charité, the Allen Institute, WashU and the UC campuses.
- **Not postings:**
  - Instituto Santos Dumont's news items: one names a prize winner, and the source has no institution;
  - Turkish announcements, probably from Gazi NÖROM: admissions, calls for study participants, a procedure, a congress;
  - a form for unsolicited applications.

  Fix each source, or make it manual.
- **Closed while waiting:** a candidate whose deadline has passed closes by itself as "closed". About 20 waited past their deadline.
- **SISSA:** 25 calls closed between October 2025 and August 2026, but their pages still say "Open". Read their deadlines, or make the source manual.
- **Dates:**
  - a range such as "21 October to 4 November" ends on its last day (Udelar);
  - "rolling" was read from unrelated phrases (4 postings);
  - a placeholder such as 31/12/2035 counts as rolling;
  - UC Recruit's final date is the deadline, not its review date;
  - DZNE's unlabeled header date is probably the deadline.
- **Oxford's CoreHR postings:** only the page header was read.
- **Institution:** take it from the posting where a source covers several sites:
  - the Max Planck Society's shared board names the institute (Bonn, not Munich);
  - VIB's Leuven centre was recorded as Ghent;
  - HHMI's posts are at host universities;
  - DZNE has sites such as Magdeburg.

  Choose from the institutions we have (ROR), and ask the operator when none fits.

### 4. The routine: "Update the jobs"

One command that does all of this, in order:
1. **Drafts** for the waiting candidates, as `docs/weekly-drafts.md` does today.
2. **A decision for each drafted candidate,** with one line saying why:
   - **publish**, only when every one of these holds:
     - the post is in neuroscience;
     - it is a research or research-support position at a research employer;
     - its deadline is at least 3 days ahead, or it is rolling and was published in the last 60 days;
     - it is on the employer's own posting page;
     - its institution is the one where the work happens;
     - its facts agree with the text;
     - nothing published names a person, an email address or a phone number;
   - **reject**, with the review queue's reasons;
   - **ask the operator**, for anything uncertain.
3. **A last look before publishing:** the server reads the posting's page once more, by the link check's rules. A page that is gone, or says the position is closed, is not published.
4. **Publishing:**
   - it makes the job from the draft, as accepting a candidate does today;
   - "Last verified" is the day of that last look;
   - the job is marked in the admin as published by the routine on the operator's command, never on the site.
5. **Closing:** published jobs whose page the link check found gone or filled are closed.
6. **A short report:**
   - how many were published, rejected and closed;
   - the questions for the operator, each with its admin link;
   - the manual sources that are due, which need a person.

- **The operator's corrections:** the operator can also say, in plain words, "remove this job" or "change its deadline". The routine applies such a change to the job, found by its address or ID, through the same rules.
- **Write it down:**
  - `docs/update-jobs.md`: the steps, the rules, and what never to do;
  - a script, if one is needed;
  - the command in `CLAUDE.md`'s session handoff.

  "Do the weekly drafts" keeps working, as the first step alone.
- **Never:**
  - publish without the operator's command;
  - read a source more than once a day;
  - send the AI anything but redacted text;
  - change an approved legal text;
  - touch anything else on the server.
- **Tests:** the decision rules with fake candidates, and the publishing path end to end with fake data.

### 5. On the server: the operator's go-ahead

- **For this task:**
  - running the new redaction over the waiting candidates' stored texts and titles;
  - running by hand the changed sources and the three still off (Gothenburg, MedUni Vienna, UNSW), and switching on those that run without a failure;
  - the first "Update the jobs", with the operator in the session: it decides the 331 drafted candidates.
- **A standing go-ahead,** like the weekly drafts' (D52): exactly the routine's export, import, last look, publishing and closing, through its operations routes and script.
- **Nothing else:** make no other change on the server, and never print a secret.

### Not in this task

- the lawyer packet (parked);
- the Claude API;
- publishing without the operator's command;
- reading the manual sources, which need a person;
- M8–M10.

### Report

At the end, one short report in plain language:
- **Redaction:** before and after, and how many names, phone numbers and email addresses the new rules caught in the stored texts;
- **Candidates:** the quality fixes, and what they changed;
- **The first run:** how many were published, rejected, asked and closed;
- **Against the launch gate:** open jobs by country, subfield and institution, compared with 150 positions, 25 countries, 12 subfields and 50 institutions;
- **The command:** in one line, as the operator will say it;
- **CI minutes:** how many this task used. About 469 of October's 2,000 are left; if fewer than 150 remain before a code pull request, stop and tell the operator.

### Working rules

Follow `CLAUDE.md`:
- one pull request per step, merged when its checks pass;
- CI minutes are limited (D46), so run every check locally before pushing, and put documentation into the same push;
- stop and ask only for rules (a) to (c), apart from the server steps approved above.
