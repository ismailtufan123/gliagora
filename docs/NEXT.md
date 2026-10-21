# Next task

Status: **open**
Written: 2026-10-22, by the operator's planning chat (Claude) on the operator's behalf.

## How this file works

- The operator clears the Claude Code session after each task and then says: "Pull main, then read docs/NEXT.md and do it." Act on this file only when the operator asks you to in the session.
- `docs/STATUS.md` is your one-page handoff: what is done, what is live, open decisions and the next step. Read it before this file, and update it at the end of every task.
- When the task below is finished, set the status above to **done**, with the date and the pull request numbers, in your last pull request. The planning chat then replaces this file with the next task.

## Task: the lawyer packet, for the one-time legal review

**Why:** M2 waits for the one-time lawyer review (D32), and that waits for a lawyer. The operator needs one packet to send to lawyers, first for a quote and then for the review itself.
- **Language:** Turkish.
- **Complete:** the lawyer needs nothing else from us.
- **Easy to answer:** written answers per question, and tracked changes in the texts.

Start by reading `CLAUDE.md`, `docs/STATUS.md` and:
- `docs/legal-open-questions.md`, all of it;
- every draft in `content/`, and `docs/legal/veri-isleme-sozlesmesi-taslak.md`;
- in `PLAN.md`: §15, §18, and D28, D32, D33, D39, D41 and D52.

### 1. The operator's open points (C6–C9, C11, C12)

The texts the lawyer reads should be as final as the operator can make them.
- **Ask:** present the six open points to the operator in the session, in Turkish. Give each its default (the "until decided" of `docs/legal-open-questions.md`) and your recommendation. The operator may accept them all at once.
- **Record:** write the answers down as decisions, D59 onwards.
- **Update:** change the two drafts they touch, the accessibility statement and the sources and editorial policy. Both stay drafts (`draft: true`).

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
  - that the drafts are confidential and not yet public.
- **The summary of Gliagora (`gliagora-ozeti.md`, 2–3 pages).**
  - what the site does, and for whom;
  - who runs it: the controller, a natural person, and the technical administrator as processor (D33);
  - where data is kept (Türkiye), and which outside services see what: Cloudflare's DNS, Google and ORCID sign-in, Anthropic for redacted text, and the mail provider still to be chosen;
  - a table of the personal data flows: what is collected, why, on which assumed legal basis, for how long, and who sees it;
  - what goes public at M2 and what at the launch;
  - that the site is non-commercial.
- **The questions (`sorular.md` and `sorular.docx`).** B1–B22 in Turkish. For each:
  - its context in a few sentences;
  - the exact question;
  - the texts it touches;
  - when its answer is needed: before M2, before the launch, or later.

  Name `docs/legal-open-questions.md` as the English original, the reference if the two differ.
- **The texts (`metinler/`).**
  - **Files:** each legal draft, the About page, the sources and editorial policy, and the processing agreement, as a Word file (.docx), so the lawyer can answer with tracked changes. Add one PDF that holds them all, for reading.
  - **A list (`metinler.md`):** for each text, its purpose, its language, when it goes live (M2 or the launch), and that it is a draft.
- **What the packet must never hold:** secrets, or real personal data beyond what the drafts already say.
- **Keeping it in step:** a way to make the Word and PDF files again after the texts change. A script is fine; mind the CI minutes.

### 3. Checks

- **Read it as the lawyer would:**
  - every question is clear without the repository;
  - every text is listed;
  - the Turkish is plain and correct, with KVKK's own terms: veri sorumlusu, veri işleyen, açık rıza, aydınlatma metni, yurt dışına aktarım.
- **An independent reviewer** reads the summary and the questions, for clarity and for accuracy against the English originals.

### On the server

- **Nothing.** This task has no server steps.

### Not in this task

- choosing a lawyer, or sending anything;
- changing the legal texts beyond the operator's decisions in section 1;
- approving or publishing any text: they all stay drafts;
- M2's other steps.

### Report

At the end, one short report in plain language:
- **Decisions:** the operator's decisions on C6–C12;
- **Files:** the packet's files with their sizes, and which to send for a quote and which for the review;
- **Gaps:** anything the lawyer will need that we cannot provide yet;
- **CI minutes:** how many this task used. About 469 of October's 2,000 are left; if fewer than 150 remain before a code pull request, stop and tell the operator.

### Working rules

Follow `CLAUDE.md`:
- one pull request per step, merged when its checks pass;
- CI minutes are limited (D46), so run every check locally before pushing, and put documentation into the same push;
- stop and ask only for rules (a) to (c), and for section 1's open points.
