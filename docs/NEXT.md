# Next task

Status: **open**
Written: 2026-10-22, by the operator's planning chat (Claude) on the operator's behalf. First written for #112 and #113, parked during the D59 task (#114–#120), and put back here with what changed since.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: the lawyer packet, for the one-time legal review

**Why:** M2 waits for the one-time lawyer review (D32), and that waits for a lawyer. The operator needs one packet to send to lawyers, first for a quote and then for the review itself.
- **Language:** Turkish.
- **Complete:** the lawyer needs nothing else from us.
- **Easy to answer:** written answers per question, and tracked changes in the texts.
- **As it works now:** since D59 (2026-10-22), positions are published on the operator's command by written rules, without a person checking each one. B17 asks the lawyer what that needs, so the packet describes it as it works today.

Start by reading `CLAUDE.md`, `docs/STATUS.md` and:
- `docs/legal-open-questions.md`, all of it;
- every draft in `content/`, the About page (`content/en/about.md`) and `docs/legal/veri-isleme-sozlesmesi-taslak.md`;
- `docs/update-jobs.md`, the written rules of D59;
- in `PLAN.md`: §15, §18, §20's "M7 notes, third round", and D28, D32, D33, D39, D41, D52 and D59.

### 1. The operator's open points (C6–C9, C11, C12, and the About page)

The texts the lawyer reads should be as final as the operator can make them.
- **Ask:** present the seven open points to the operator in the session, in Turkish. The operator may accept them all at once.
  - C6–C9, C11 and C12: give each its default (the "until decided" of `docs/legal-open-questions.md`) and your recommendation.
  - The About page's "How curation works", item 3, below.
- **The About page, item 3.** It still says each entry has "a short summary we write ourselves", but since D59 an AI assistant drafts the summaries of positions. The About page is approved, so change it only with the operator's approval of the exact words. The planning chat recommends this wording, which keeps the drafts' own phrase, "a short summary in our own words":

  > 3. **Summarise in our own words.** Each entry gives the facts and a short summary in our own words; for positions, an AI assistant drafts it from the original posting. We do not copy descriptions, abstracts, images or logos.

  If another sentence of the About page no longer holds since D59, show it to the operator the same way, with a proposed wording. Change nothing there without the operator's approval.
- **Record:** write the answers down as decisions, D60 onwards (D59 is the last one).
- **Update:**
  - change the two drafts the C points touch, the accessibility statement and the sources and editorial policy; both stay drafts (`draft: true`);
  - change the About page's item 3 if the operator approves it.

  Changes under `content/` run CI. Put them, and any script of section 2, into one code pull request.

### 2. The packet (`docs/legal/avukat-paketi/`, in Turkish)

- **`README.md`, for the operator.** How to use the packet:
  - which files to send for a quote, and which for the review;
  - what kind of lawyer: KVKK and IT law, in Türkiye;
  - what to ask for in the quote: the scope, the deliverables, one follow-up round, the timeline and a fixed fee;
  - how the answers come back: to the planning chat, which turns them into a task.
- **The cover letter (`on-yazi.md`).** An email the operator can send as it is. Leave placeholders for the sender's name and contact details, and never fill them in. It says:
  - who we are and what we ask;
  - the scope and the deliverables: written answers per question, and tracked changes in the texts;
  - the timeline we need: before M2;
  - that we ask for a fixed-fee quote;
  - that the texts are drafts, not yet live on the site.
- **The summary of Gliagora (`gliagora-ozeti.md`, 2–3 pages).**
  - what the site does, and for whom;
  - who runs it: the controller, a natural person, and the technical administrator as processor (D33);
  - how positions are found and published:
    - the monitors read employers' own pages (D52), and redaction removes names and contact details before anything is stored;
    - an AI assistant drafts each position;
    - since D59, publishing rounds run on the operator's command, with written rules and a last look at the employer's page, and no person checks each listing (B17);
  - where data is kept (Türkiye), and which outside services see what:
    - Cloudflare's DNS;
    - Google and ORCID sign-in;
    - Anthropic, for redacted listing text: Claude Code on the operator's computer, in the weekly drafts and in each publishing round (the Claude API is built but off);
    - the mail provider, still to be chosen;
  - a table of the personal data flows: what is collected, why, on which assumed legal basis, for how long, and who sees it;
  - what goes public at M2 and what at the launch;
  - that the site is non-commercial.
- **The questions (`sorular.md` and `sorular.docx`).** B1–B22 in Turkish. For each:
  - its context in a few sentences;
  - the exact question;
  - the texts it touches;
  - when its answer is needed: before M2, before the launch, or later.

  Name `docs/legal-open-questions.md` as the English original, the reference if the two differ.

  First bring B17 and B22 up to date there, in English, since D59 changed what they say:
  - B17 (2) says that the About page's section on reading employers' pages says a person checks every position first. The operator changed that section on 2026-10-22.
  - B17 says the redaction rules were widened "before the next run". In fact the second weekly drafts run (231 candidates) also ran on the first rules; the second round of rules came after it (#116). Use the numbers below.
  - B22 still says that a person checks and approves every item. Since D59 that no longer holds (B17).
- **The texts (`metinler/`).**
  - **Files:** each legal draft, the About page, the sources and editorial policy, and the processing agreement, as a Word file (.docx), so the lawyer can answer with tracked changes. Add one PDF that holds them all, for reading.
  - **A list (`metinler.md`):** for each text:
    - its purpose;
    - its language;
    - when it goes live (M2 or the launch);
    - its state: a draft, or approved by the operator (the About page; it changes only with the operator's approval).
- **Redaction, as it really works:** say it plainly in the summary and in B17 and B22, with the numbers in PLAN §20 (M7 notes, third round).
  - **The first two weekly AI drafts runs** (2026-10-22, 331 candidates) ran on the first rules, and all 331 texts went to Anthropic. In the first 100 texts:
    - names were left in about half: HR and union contacts, team leaders, names inside lab addresses and CNRS reference codes;
    - phone numbers were left in 7;
    - a name with an email address was left in 1.
  - **The second round of rules** (#116, 2026-10-22) then ran again over the 374 waiting candidates and their saved versions. It removed:
    - from texts: 195 names, 43 phone numbers and 403 web addresses;
    - from titles: 46 names and one email address;
    - from facts and drafts: 49 more names.
  - **What is left:**
    - names in about 40 of 306 texts, about one in seven: in reference lists, in attachments' names and in titles with a hyphen;
    - a few institutional switchboard and press-office numbers.

    A third round of rules comes when the next drafts show them.
  - **What is published:** no published listing names a person or gives an email address or a phone number. Before publishing, the server checks every title, summary, start date and city again (D59).
- **What the packet must never hold:** secrets, or real personal data beyond what the drafts already say.
- **Keeping it in step:** a way to make the Word and PDF files again after the texts change. A script is fine; put it into section 1's code pull request.

### 3. Checks

- **Read it as the lawyer would:**
  - every question is clear without the repository;
  - every text is listed;
  - the summary describes publishing as D59 does it;
  - the Turkish is plain and correct, with KVKK's own terms: veri sorumlusu, veri işleyen, açık rıza, aydınlatma metni, yurt dışına aktarım.
- **An independent reviewer** reads the summary and the questions, for clarity and for accuracy against the English originals.

### On the server

- **Nothing.** This task has no server steps.

### Not in this task

- choosing a lawyer, or sending anything;
- changing the legal texts beyond the operator's decisions in section 1;
- approving or publishing any text: they all stay drafts;
- "Update the jobs": it runs only on the operator's own command;
- the repository's visibility on GitHub: the operator's own decision;
- M2's other steps.

### Report

At the end, one short report in plain language:
- **Decisions:** the operator's decisions on C6–C12, and on the About page's item 3;
- **Files:** the packet's files with their sizes, and which to send for a quote and which for the review;
- **Gaps:** anything the lawyer will need that we cannot provide yet;
- **CI minutes:** how many this task used.
  - On 2026-10-22 GitHub reported the repository as public (`gh api repos/ismailtufan123/gliagora --jq .visibility`). The planning chat has asked the operator whether that is wanted.
  - While it is public, GitHub's standard runners cost it no minutes. Say which it is when you start.
  - If it is private again, about 360 of October's 2,000 are left by the last count. If fewer than 150 remain before a code pull request, stop and tell the operator.

### Working rules

Follow `CLAUDE.md`:
- one pull request per step, merged when its checks pass;
- CI minutes are limited (D46), so run every check locally before pushing, and put documentation into the same push;
- stop and ask only for rules (a) to (c), and for section 1's open points.
