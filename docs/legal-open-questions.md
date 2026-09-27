# Legal drafts: open questions, sorted

The legal texts in `content/` are drafts (D28): each page shows a draft notice and is not indexed, and a text is published only after the operator approves that exact wording. They are not legal advice.

After M1 the drafts had 111 open questions, plus one open point that was only marked in the terms. On 2026-09-27 they were sorted into three groups, as the operator asked:

| Group | What happens | Count |
|---|---|---|
| (a) Answerable from PLAN.md | The answer is now written into the draft and its marker is gone. | 49 questions |
| (b) Needs a lawyer | One review by a lawyer between S and M2, before the texts go live (pre-launch checklist, PLAN §20, D32). | 47 questions, merged into **17** (B1–B17), plus **B18** added on 2026-09-27 (C2): **18** in all |
| (c) Only the operator can decide | Decided by the operator on 2026-09-27 (PLAN D32–D36). The decisions are written into the drafts and their markers are gone. | 13 questions, merged into **5** (C1–C5) |

Five more questions were settled by a default (listed below, with the other defaults the drafts follow). Two questions were split between groups (privacy policy 22 and terms 3), so the tables at the end have 114 rows for 112 questions. In the drafts every remaining marker names its item, for example `[TO DECIDE: B4 – …]` or `[KARAR VERİLECEK: B7 – …]`. A few markers name a milestone or a step instead ("S and M4b", "M4", "before publication", "when ALTCHA … are built", and "before signing" in the processing agreement): they are facts to fill in at that point, not questions.

## (c) Decisions for the operator — decided 2026-09-27

The operator decided all five on 2026-09-27; they are recorded in PLAN §22.3 (D32–D36). Each decision is written into the drafts and its markers are gone.

### C1. When the texts go public: approved

**Decided.** The whole site stays private until M2. Order: server setup (S), then the one-time lawyer review, then M2. At M2, hello@ moves to the Turkish mail host, and the two contact pages, the privacy policy, the KVKK aydınlatma metni and the açık rıza metni go live together with the newsletter signup. The terms and the other legal pages go live by M6. Until M2, hello@ keeps its current forwarding (Cloudflare Email Routing). (D32)

**In the drafts.** Nothing is public before M2, so no text describes the interim forwarding, the interim mailbox or a transfer abroad for it. The drafts read as they will be true at M2. This also settles part (3) of B12.

Texts: `content/en/contact.md`, `content/tr/iletisim.md`, `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`, `content/en/legal/terms.md`

### C2. Access by anyone other than the controller: yes

**Decided.** Besides the controller, a technical administrator has access to the server, the admin panel and the databases. This person is our processor (veri işleyen; KVKK m.12, GDPR Art. 28) under a one-page written agreement. The draft, in Turkish, is `docs/legal/veri-isleme-sozlesmesi-taslak.md`; the lawyer reviews it (B18). The privacy policy and the KVKK aydınlatma metni describe the role without naming the person. (D33)

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### C3. Retention periods: approved as proposed

**Decided.** The periods for the data that PLAN gave no period for (D34):

- Hashed IP addresses for the suggestion-form limit: kept only in the app database on our server, deleted after 24 hours.
- Bounce records: deleted together with the address.
- Suggestion link and note: deleted with the email, 90 days after the decision.
- Ordinary email to hello@: 2 years after the last message.
- Admin audit log: 1 year.
- Container and application logs: 14 days, like the server logs.
- Mailing-list messages in the project mailbox: 30 days after they arrive.
- Listings that have gone offline: the full record for 12 months, then only the web address and ID, so that the page keeps answering 410.
- AI audit copy (only once AI drafting is on): 30 days after the decision.

The lawyer sees the final table in B11.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### C4. Preferred subfields at launch: approved as proposed

**Decided.** At launch, a member's preferred subfields only set the default subfield filter on the jobs list while the member is signed in. Glia Notes is the same issue for everyone until Phase 2, and no profile is built. (D35)

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`, `content/en/legal/terms.md`

### C5. Telling people about changes: approved as proposed

**Decided.** Important changes (a new purpose, a new recipient, a transfer abroad or new duties for members) are emailed to members, shown as a dated notice on the page 30 days before they apply, and mentioned in the next Glia Notes. Smaller edits only get a new date on the page. (D36) The lawyer still checks the terms' change clause in B16.

Texts: `content/en/legal/terms.md`, `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

## (b) Questions for the one-time lawyer review

To be answered in one review before the texts go live. Each question is written so that it can be sent to the lawyer as it is; "why" says what the answer changes.

### B1. Law 5651: who the content provider is and what the contact page must show

Gliagora is run by one natural person resident in Türkiye (no company, no revenue, no ads or sponsorship at launch). It publishes only editorial content: suggestions are checked and rewritten by her before publication, and there is no user content in Phase 1. (1) Is she the içerik sağlayıcı under Law 5651 Art. 2, and not a yer sağlayıcı for the suggestions she rewrites? (2) Under Art. 3 and Art. 5 of the 2007 regulation, is an email address under an 'İletişim' heading, reachable from the home page, enough at launch, or must her full name and postal address appear from day one? (3) Not needed for launch: once the first revenue arrives, which details does Art. 5 require (name, postal address, telephone, tax number?), and is a virtual-office address acceptable instead of the business address from the tax registration?

**Why it matters.** Decides whether the contact pages can go live with an email address only (D9), and whether the sentence naming the editor as content provider stays on both contact pages. Part (3) goes on the before-any-revenue checklist.

Texts: `content/en/contact.md`, `content/tr/iletisim.md`, `content/en/legal/terms.md`

### B2. Law 5651 Art. 9: deadline for personal-rights removal requests

Under Law 5651 Art. 9 as now in force: (1) how soon must a content provider answer a request to remove content that violates personal rights, and must that answer be a decision (remove or refuse), or is an acknowledgement enough? (2) Is our plan lawful: an automatic acknowledgement at once, and a decision usually within 72 hours (or within the legal deadline, if the law requires a decision)? (3) Is it correct and advisable to tell people that they can also apply directly to the sulh ceza hâkimliği, without contacting us first?

**Why it matters.** Sets the takedown timelines on three pages now, on the notice and takedown page (M4) and in the admin countdown. If a decision is required within 24 hours, the operator must check requests every day. The sentence about the sulh ceza hâkimliği is removed unless you confirm it.

Texts: `content/en/contact.md`, `content/tr/iletisim.md`, `content/en/legal/terms.md`

### B3. Law 4904: the publisher statement

Gliagora lists only vacancies that come from the employer, with a short summary in our own words and a link to the employer's page. It takes no CVs, applications, matching or fees. Is this statement accurate and advisable: 'We are not an employment agency and do not act as an intermediary in job placement; in Türkiye anyone who does so, including online, needs İŞKUR permission under Law No. 4904'? Should the public text cite the law, and which Turkish term is correct in the current law: 'işe yerleştirmeye aracılık' or 'iş ve işçi bulmaya aracılık'? The terms of use (English only) state this position at more length than the Turkish statement on the Turkish contact page: must the two match, and should the terms say which language applies if they differ?

**Why it matters.** PLAN §15.1 requires this statement in English and Turkish. It is the main defence against risk 6 (İŞKUR treating aggregation as intermediation), and PLAN found no İŞKUR guidance on facts-only sites [U].

Texts: `content/en/contact.md`, `content/tr/iletisim.md`, `content/en/legal/terms.md`

### B4. Legal bases (KVKK m.5, GDPR Art. 6) for everything except the newsletter

PLAN fixes only the newsletter basis (açık rıza / consent). Is the proposed basis right for each other activity in the two notices? In particular: consent records (m.5/2(ç) or (e); GDPR 6(1)(c) with Art. 7(1), or (f)); member accounts and the session cookie (m.5/2(c); 6(1)(b)); the inactivity warning (f) and the final account-deletion email (ç); KVKK data requests (ç) and Law 5651 removal requests (ç/e; GDPR (f)); corrections, ordinary email, logs, rate limits, analytics, admin accounts and backups (f); and people named in employers' public postings, such as a lab head (f, plus m.5/2(d) for data they made public themselves?). Does the notice also meet GDPR Art. 14 for those named people?

**Why it matters.** Every row of both notices depends on it. The legal-basis markers can only be removed after this answer.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B5. KVKK applications without a published postal address

The controller publishes no postal address before any revenue (D9), and PLAN lists no KEP address. Under the Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ: (1) are these channels enough: the data-request web form with an email verification link; email to privacy@gliagora.com from an address registered with us (and what about an unregistered address?); and an application signed with a secure electronic or mobile signature and sent by email? (2) Must she also give an address for written applications, or get a KEP address? If so, may it be the business or virtual-office address planned for later? (3) May an application ask only for name, email and the request, with identity checked by the verification link, instead of the T.C. kimlik number and an address for notices?

**Why it matters.** 'How to apply' is a required element of both notices (KVKK Art. 10). If a postal or KEP address is required, the operator needs one before signups open at M2. All four texts must use the same wording.

Texts: `content/en/contact.md`, `content/tr/iletisim.md`, `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B6. VERBİS registration

The controller is a natural person resident in Türkiye, with no company and no revenue. Her main activity is not processing special categories of data, and the expected scale is about 1,000 members and subscribers (D5). Is she exempt from VERBİS registration under the Board's current thresholds?

**Why it matters.** If registration is needed, it must be done before processing starts (M2), and the notices must match the registry entries. PLAN marks the exemption [U].

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B7. Minimum age

PLAN sets 16 as the minimum age for the newsletter. (1) In Türkiye, can a 16- or 17-year-old who has discernment (TMK m.16) validly give açık rıza for the newsletter, and enter into the free member-account contract (m.5/2(c)), without a parent or guardian? (2) Is 16 also acceptable for the optional email on the suggestion form, and for EU users, given that GDPR Art. 8 lets member states set an age between 13 and 16? Until you answer, the drafts use one rule: 16 for every feature.

**Why it matters.** The age is stated on the signup form (M2) and for accounts (M4b). If 18 or a guardian's consent is needed, the forms and three texts change.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`, `content/en/legal/terms.md`

### B8. Optional email on the 'Suggest a listing' form

The form has an optional email field with an unticked checkbox. The address is used only to tell the submitter the outcome and is deleted 90 days after the decision. Under KVKK, is the basis açık rıza (m.5/1), which would need its own separate consent text, or meşru menfaat (m.5/2(f)) with the checkbox worded as a request to be contacted? Under the GDPR, is Art. 6(1)(a) with withdrawal by email right?

**Why it matters.** If the answer is açık rıza, a second açık rıza metni must be written and approved before the form opens in M4.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B9. Accepting the terms (contract basis for accounts)

Member accounts (free: saved items and settings) rest on a contract (KVKK m.5/2(c), GDPR 6(1)(b)). Is a line under the sign-in buttons ('By continuing you accept the terms of use; see the privacy policy', with links) enough to conclude that contract, or is an unticked checkbox needed at the first sign-in? Do the terms bind visitors without an account through 'By using the site, you agree to them'?

**Why it matters.** Decides the sign-in design built in M4b and whether the contract basis in both notices holds.

Texts: `content/en/legal/terms.md`, `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B10. Rights, answer period and complaint wording

Please check against the current law: (1) the lists of rights (KVKK m.11; GDPR Arts. 15–22, including the Art. 21 objection wording); (2) the promise to answer free of charge within 30 days (KVKK m.13) or one month (GDPR Art. 12(3)) without using the extension; (3) the KVKK m.14 complaint conditions and periods as drafted: after a rejection, an insufficient answer or no answer; within 30 days of learning the answer, and at most 60 days after the application; (4) whether the GDPR parts should say 'EU and EEA', and whether people outside the EU should be able to object in the same way.

**Why it matters.** These are required elements of both notices, and PLAN marks the wording [U] (§15.1).

Texts: `content/en/contact.md`, `content/tr/iletisim.md`, `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B11. Retention periods and proof of consent

(1) Are these periods appropriate under KVKK and the GDPR, given proof duties and limitation periods? Consent records: for the subscription plus 3 years. Records of data requests, Law 5651 removal requests and corrections: 2 years after closure, in the database and the mailbox. (2) On unsubscribing, the address is deleted at once, and the consent record keeps only a random ID, the event, the text version, the time and the form. Is that still adequate proof of consent, or must more be kept? (3) Please also look over the whole retention table, including the periods the operator sets (C3).

**Why it matters.** The retention table is a required part of the privacy policy. PLAN marks both periods [U]. If more proof must be kept, the rule 'deleted at once on unsubscribe' changes.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B12. Cloudflare DNS and server access from abroad (transfers under KVKK m.9)

(1) Cloudflare (outside Türkiye) is our registrar and DNS provider. All web records are DNS-only, so no visitor traffic passes through Cloudflare. Is this a transfer abroad under KVKK m.9, and must the notices mention it? (2) If the controller, or the technical administrator (C2, B18), logs in to the Istanbul server from abroad (for example while travelling), is that a transfer under m.9? (3) Settled by C1, no answer needed: the site stays private until M2, when hello@ moves to the Turkish mail host, so no text describes the interim forwarding through Cloudflare Email Routing.

**Why it matters.** Decides whether the notices can say there are no transfers abroad apart from the listed exceptions.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`, `docs/legal/veri-isleme-sozlesmesi-taslak.md`

### B13. Sign-in with Google or ORCID, and delivery of our emails

(1) Members may sign in with Google (scopes 'openid email': email address and account ID) or ORCID (the iD, and the name only if the member keeps it). We send nothing beyond the redirect. Are Google and ORCID independent controllers for this step? Is it a transfer abroad by us under KVKK m.9 when the member chooses the provider? (2) Our emails go from our Turkish mail host to the address each person gave us, and that person's provider (for example Gmail) may be abroad. Is that delivery a transfer by us, and should the notices mention it? Is the draft wording on both points enough?

**Why it matters.** This covers two sections of each notice. If sign-in counts as a transfer by us, the M4b sign-in design may change. PLAN marks its own view [U].

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B14. Cookieless analytics (Umami)

Umami runs on our own server in Türkiye and sets no cookies. It keeps raw page-view events for 12 months and totals with no end date. The exact fields of a raw event will be listed from the installed version at server setup and given to you with the texts. Are raw events personal data under KVKK and the GDPR? If so, is legitimate interest (m.5/2(f); Art. 6(1)(f)) enough without consent, and does ePrivacy Art. 5(3) still allow the site to run without a banner?

**Why it matters.** 'No cookie banner' (PLAN decision 4) and the analytics sections of both notices rest on this.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B15. Data breaches and disclosure to authorities

(1) Is the KVKK rule 'notify the Board within 72 hours' current? What do KVKK m.12(5) and GDPR Arts. 33–34 require about informing the people affected, and should the notice promise to inform them? (2) Is 'We give personal data to public authorities or courts only when the law requires it' an adequate description of that group of recipients under KVKK m.10 and GDPR Art. 13(1)(e), for example for requests under Law 5651?

**Why it matters.** Sets the breach runbook (§18.2) and two statements in the notice. PLAN marks the 72-hour rule [U], and the line about authorities is not in PLAN.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B16. Terms of use under consumer law

These are free terms of use, offered worldwide by a natural person in Türkiye. Under Turkish law (TBK Arts. 20–25 on general terms of business; Law No. 6502) and EU consumer rules, are these clauses valid against consumers? (1) Turkish law applies, without removing mandatory consumer rights elsewhere; and which courts, if any, should be named? (2) The liability exclusions, with the carve-out for intent and gross negligence (TBK m.115). (3) Suspending or deleting an account that breaks the terms. (4) The submitter confirming that they may share a suggested link and note. (5) 'If you keep using Gliagora after a change takes effect, the new version applies.' (6) The rule on using the Gliagora name and logo, which is not a registered trademark.

**Why it matters.** The terms go live by M6 at the latest (C1). Any clause you reject is removed. PLAN marks the governing-law clause [U] and says only 'liability limits as permitted'.

Texts: `content/en/legal/terms.md`

### B17. Claude API, before AI drafting is switched on (after launch)

AI drafting is off at launch; it may be switched on in M7. Listing texts and openly licensed paper texts would then go to the Claude API (Anthropic, outside Türkiye), after emails, phone numbers and personal names have been removed. An audit copy of what was sent is kept. PLAN assumes that Anthropic does not sign the KVKK standard contract. Is the redacted text still personal data? If so, which KVKK m.9 route (as amended in 2024) and which GDPR Chapter V basis could allow the transfer, and what must the notices then say?

**Why it matters.** AI drafting stays off until this is answered. It is asked in the same review so that no second review is needed.

Texts: `content/en/legal/privacy.md`, `content/tr/legal/kvkk-aydinlatma-metni.md`

### B18. The data processing agreement with the technical administrator

Besides the controller, one natural person, the technical administrator, maintains the server and the software and has access to the server, the admin panel and the databases. We treat this person as our processor (veri işleyen). The draft agreement, one page in Turkish, is `docs/legal/veri-isleme-sozlesmesi-taslak.md`. (1) Does it meet KVKK m.12 and GDPR Art. 28(3), and is anything missing? (2) Is processor the right role for this person under both laws?

**Why it matters.** The agreement must be signed before the texts go live at M2. Both notices describe this role as a processor under a written agreement, without naming the person (C2, D33); if the role is different, those passages change.

Texts: `docs/legal/veri-isleme-sozlesmesi-taslak.md`; the role is described in `content/en/legal/privacy.md` and `content/tr/legal/kvkk-aydinlatma-metni.md`

## Defaults applied

Settled in the drafts by a default, mostly following PLAN; change any of them by telling me.

- **Minimum age.** One rule in every text: 16 for the newsletter, member accounts and the optional email on the suggestion form, until the lawyer answers B7. (Source: en-terms Q4 (moved from c to B7); PLAN §3.2, §15.4 (privacy policy: minimum age 16), §22.1 (7).)
- **The 'what Gliagora is' paragraph on the contact pages.** Worded so that it stays true as sections open, on both contact pages ('We are building one place for neuroscience positions, events, funding, papers, news and resources. We open sections step by step. The menu lists every section, and a section that is not open yet says so on its page'), instead of a list of what is live. This avoids a new approval at every phase, which matters if the contact pages go public at M2 (C1). (Source: en-contact Q14; PLAN §15.4 (contact page: what Gliagora is), §3.1, D28.)
- **Texts published at M2 describe later features.** The privacy texts published at M2 already describe accounts, the suggestion form and 'Report a problem' as they will work ('if you create an account…'). Each description is checked against the built feature at M4 and M4b, and a new approval is needed only if the wording must change. (Source: C1; PLAN §20 (M2, M4, M4b), D28.)
- **Licence of our summaries.** The terms keep 'quote with attribution and a link'. No CC BY licence is offered, and the terms say nothing about bulk or automated reuse (including the jobs feed) unless a problem arises. (Source: en-terms Q5; PLAN §15.4 (terms: licence of our summaries), §2.2.)
- **Language of messages and requests.** Both contact pages and the KVKK aydınlatma metni say that people may write in Turkish or English. (Source: tr-iletisim Q8; PLAN §1, §12, §15.4, D10.)
- **Version label and effective date.** Every legal text that carries a version line (privacy policy, KVKK aydınlatma metni, terms) starts at 'Version 1.0', not '1'. The effective date is the publication date, written in the approval commit that sets draft to false. (Source: en-privacy Q30, tr-kvkk Q22, en-terms Q1; PLAN D28, §12, §15.4.)
- **Turkish apostrophes.** All Turkish texts follow the TDK spelling guide, as the drafts already do: no apostrophe before suffixes on the names of institutions, boards and laws (Kanununun, Kuruluna), an apostrophe after company, brand and place names (Gliagora'nın, Türkiye'de). PLAN says nothing on this, so this default follows TDK, not PLAN. (Source: tr-kvkk Q30.)
- **Spelling.** The English texts use British spelling, as the drafts already do ('organisation', 'licence', 'programme'). PLAN mixes British and American spelling, so this is a default; tell me if the site should use American spelling. (Source: en-terms Q21.)

## Where each question went

The numbers are those of the M1 list (see the git history of this file). "a" means answered in the draft from PLAN.

### Contact and legal notice (`/en/contact/`)

| # | Question | Now |
|---|---|---|
| 1 | Can a non-commercial site list only an email address on the contact page under the Law 5651 regulation? | B1 |
| 2 | Before any income, which postal address goes on the page, and does regulation Art. 5 require other details such as a telephone number? | B1 |
| 3 | Should the contact page name the editor and data controller (Nuray Sancar), or only point elsewhere? | a |
| 4 | Is the editor (the natural person, not the brand) the content provider (içerik sağlayıcı) under Law 5651? | B1 |
| 5 | What is the current Law 5651 Art. 9 deadline, does it require a decision, and how do the 24-hour target and the usual 72-hour decision fit together? | B2 |
| 6 | Is the statement about applying directly to a sulh ceza hâkimliği correct under Law 5651 Art. 9(1)? | B2 |
| 7 | Is the Law 4904 wording right, and should the public text cite the law number? | B3 |
| 8 | With no postal address, how are written and KEP applications received, and does email from an unregistered address count as a KVKK application? | B5 |
| 9 | Once the Turkish mailbox exists (M2), should data requests move to privacy@ while everything else stays on hello@? | a |
| 10 | If the legal pages go live before M2, does the contact page need a note about Cloudflare Email Routing? | C1 |
| 11 | Should links to pages that do not exist yet be hidden until those pages exist? | a |
| 12 | Should the page consistently call the privacy page 'privacy policy'? | a |
| 13 | Does 'We charge no fees, and no one can pay to have a listing shown or promoted' stay true after Phase 4 sponsorship? | a |
| 14 | Should the 'What Gliagora is' paragraph be updated as each phase goes live? | default |
| 15 | What is the notice and takedown page called, which fields does 'Report a problem' collect, and does it send an automatic confirmation? | a |
| 16 | Should the @gliagora Instagram and LinkedIn profiles be added as plain links? | a |
| 17 | Should the page show an effective date or a 'Last updated' line, and with which date? | a |

### İletişim ve yasal bilgiler (`/tr/iletisim/`)

| # | Question | Now |
|---|---|---|
| 1 | Should the Turkish contact page name Nuray Sancar from launch, or link to the KVKK aydınlatma metni for her identity? | a |
| 2 | Which postal address before the first revenue, and is a non-commercial site outside the 2007 Law 5651 regulation's list? | B1 |
| 3 | Is the natural person who runs Gliagora the içerik sağlayıcı under Law 5651 in Phase 1? | B1 |
| 4 | Does a 24-hour acknowledgement plus a decision usually within 72 hours meet Law 5651 Art. 9, and is the sulh ceza hâkimliği wording correct? | B2 |
| 5 | Will Turkish versions of the takedown and data-request pages exist at launch? | a |
| 6 | Once the Turkish mailbox exists (M2), should privacy@ replace hello@ for data requests? | a |
| 7 | If the page goes live before M2, should it mention Cloudflare Email Routing, and where is the destination mailbox? | C1 |
| 8 | Should the page say people may write in Turkish, and also that English is accepted? | default |
| 9 | Should the page list the @gliagora Instagram and LinkedIn profiles as plain links? | a |
| 10 | Without a published postal address, how are the KVKK application channels met, and is email from a registered address enough? | B5 |
| 11 | Is the current Law 4904 term 'işe yerleştirme(ye aracılık)' or 'iş ve işçi bulmaya aracılık'? | B3 |
| 12 | Is it right to make the Turkish version of the rest of the site conditional, following the §3.4 gate? | a |
| 13 | What are this text's effective date and version, and does it give the same facts and links as /en/contact/? | a |

### Privacy policy (`/en/legal/privacy/`)

| # | Question | Now |
|---|---|---|
| 1 | Confirm or replace every proposed legal basis other than the newsletter's explicit consent. | B4 |
| 2 | Under KVKK, should the optional email on the Suggest-a-listing form rest on explicit consent or legitimate interest? | B8 |
| 3 | Which KVKK application channels must the notice offer when no postal address is published? | B5 |
| 4 | Does privacy@ replace hello@ for data requests once the Turkish mailbox exists (M2)? | a |
| 5 | Does someone other than Nuray Sancar run the technical side, and how should the notice describe that role? | C2 |
| 6 | What are Hosting Türkiye's legal entity details, is it registered in Türkiye, and is its processor agreement signed? | a |
| 7 | Which backup provider, mail provider and SMTP relay, and does the weekly backup copy continue after M2? | a |
| 8 | Is the interim Cloudflare Email Routing transfer, and the DNS-only use of Cloudflare, lawful under KVKK, and what must the notice say? | B12 |
| 9 | Before AI drafting is switched on, what are the KVKK Art. 9 route and the GDPR transfer basis for the Claude API? | B17 |
| 10 | How should the notice describe sign-in with Google and ORCID, and must it mention emails reaching recipients' mail providers abroad? | B13 |
| 11 | How do members accept the terms of use at sign-in, so that the contract basis for accounts holds? | B9 |
| 12 | Is an unsubscribed address deleted at once or kept on a suppression list, and how are consent records unlinked? | a |
| 13 | Are the retention periods right: 3 years for consent records, 2 years for request records? | B11 |
| 14 | Set the retention periods that PLAN does not fix. | C3 |
| 15 | How do sign-in and the other forms identify requests for their rate limits? | a |
| 16 | Which records does the automatic deletion for non-members cover? | a |
| 17 | Does the 6-month limit for backups apply to all erased data, or only to former subscribers? | a |
| 18 | Which fields do the Caddy server logs contain? | a |
| 19 | Which fields does a raw Umami event hold, and are they personal data? | B14 |
| 20 | What does the site store in the browser: theme choice, sign-in cookies, ALTCHA, the translated-version notice, the editor session cookie? | a |
| 21 | Which minimum age applies to accounts and the suggestion form, and can 16- and 17-year-olds in Türkiye give explicit consent themselves? | B7 |
| 22 | Part 1: what do preferred subfields do at launch? | C4 |
| 22 | Parts 2 and 3: which fields does 'Report a problem' collect, and does signing in during the 30-day warning keep an inactive account? | a |
| 23 | Are the rights lists, the answer period and the KVKK complaint periods worded correctly? | B10 |
| 24 | Should objections from people outside the EU be handled the same way, and should the notice mention the EEA? | B10 |
| 25 | Is the KVKK 72-hour breach rule current, and should the notice promise to inform the people affected? | B15 |
| 26 | Keep the line 'we give data to authorities or courts only when the law requires it'? | B15 |
| 27 | What legal basis covers the names of people that appear in listings and sources? | B4 |
| 28 | Should links to legal pages that do not exist yet become plain text? | a |
| 29 | Is Gliagora exempt from VERBİS registration, and what do the uptime monitor and deliverability tools see? | B6 |
| 30 | What effective date and version number does the text get at publication? | a |

### KVKK aydınlatma metni (`/tr/legal/kvkk-aydinlatma-metni/`)

| # | Question | Now |
|---|---|---|
| 1 | Which KVKK m.5 legal basis applies to each processing activity other than the newsletter? | B4 |
| 2 | Which legal basis applies to the optional email on the 'Suggest a listing' form? | B8 |
| 3 | Do the application channels meet the Başvuru Tebliği when no postal address and no KEP address are published? | B5 |
| 4 | Which identification details should a KVKK application ask for? | B5 |
| 5 | Should privacy@gliagora.com be named for data requests once the Turkish mailbox exists (M2)? | a |
| 6 | Who are the processors, are they Turkish-registered, and are KVKK Art. 12 agreements signed? | a |
| 7 | Does anyone other than the data controller run the technical side of the site? | C2 |
| 8 | Should this text go live before M2, while hello@ still runs through Cloudflare Email Routing? | C1 |
| 9 | Which KVKK m.9 route covers sending redacted listing texts to the Claude API, and how long is the audit copy kept? | B17 |
| 10 | How should Google and ORCID sign-in be described under KVKK? | B13 |
| 11 | Should the text say that our emails are delivered to the recipient's own mail provider, which may be abroad? | B13 |
| 12 | Which retention periods apply where PLAN gives none, and what happens to an address when someone unsubscribes? | C3 |
| 13 | Does the 6-month backup ageing cover all deleted data, and does the weekly copy continue after M2? | a |
| 14 | What do members' 'preferred subfields' do at launch? | C4 |
| 15 | Which fields does the 'Report a problem' form collect? | a |
| 16 | What minimum age applies to member accounts and the suggestion form, and can 16- and 17-year-olds give açık rıza on their own? | B7 |
| 17 | Is a raw Umami visit record personal data? | B14 |
| 18 | Which fields do the server access logs hold, and are one-time codes and email addresses in URLs kept out of them? | a |
| 19 | Is the hashed IP also used to rate-limit sign-in and the other forms? | a |
| 20 | Which records does the automatic deletion for non-members cover? | a |
| 21 | Are the KVKK m.11 rights and the m.14 complaint conditions and periods worded correctly? | B10 |
| 22 | What are the version number and effective date of this text? | a |
| 23 | Should members and subscribers also be told about material changes to this text by email? | C5 |
| 24 | Is the controller exempt from registering with VERBİS? | B6 |
| 25 | Are remote access to the server from abroad and Cloudflare DNS transfers abroad under KVKK m.9? | B12 |
| 26 | What does the site store in the browser for sign-in, the theme, ALTCHA and the language banner? | a |
| 27 | Will Turkish versions of the privacy, cookies, takedown and data-request pages exist? | a |
| 28 | Will the terms of use contain the account terms that the m.5/2(c) basis for accounts assumes? | a |
| 29 | Does the interface text quoted in the draft match the planned UI? | a |
| 30 | Should all Turkish texts use the TDK apostrophe style the draft follows? | default |

### Terms of use (`/en/legal/terms/`)

| # | Question | Now |
|---|---|---|
| – | Should the Contact section name privacy@gliagora.com for data requests once the Turkish mailbox exists (M2)? | a |
| 1 | Which effective date and version number should the terms carry, and should the 'Version history' table stay? | a |
| 2 | May the terms name Nuray Sancar as the person who runs Gliagora? | a |
| 3 | Parts 1–3: are full Turkish terms published or only the no-intermediary section, where, and who writes it? | a |
| 3 | Part 4: which language prevails if the English and Turkish statements differ? | B3 |
| 4 | Does the minimum age of 16 also apply to member accounts and the 'Suggest a listing' form? | B7 |
| 5 | Keep 'quote with attribution and a link' or offer a formal licence such as CC BY, and is bulk or automated reuse allowed? | default |
| 6 | Is 'Turkish law, without removing mandatory consumer rights elsewhere' valid, and which courts are competent? | B16 |
| 7 | What is the current Law 5651 Art. 9 deadline, and must the reply within 24 hours contain a decision? | B2 |
| 8 | How are members told about important changes to the terms, and how many days in advance? | C5 |
| 9 | How does sign-up show acceptance of the terms, and is that enough for a contract basis for accounts? | B9 |
| 10 | Should clauses that PLAN does not state be confirmed or removed? | B16 |
| 11 | Is the liability clause, with its carve-out for intent and gross negligence, valid under Turkish law and EU consumer rules? | B16 |
| 12 | Should the terms mention AI tools, or leave that to the sources and editorial policy? | a |
| 13 | The terms point to pages that may not exist when they go live. | a |
| 14 | The terms describe features that do not exist yet; add an 'in preparation' note, or keep the terms unpublished until M6? | C1 |
| 15 | Phase 3 and Phase 4 will need new versions of the terms; the draft only promises sponsorship labels. | a |
| 16 | Does the 6-month backup ageing also cover deleted member accounts? | a |
| 17 | What do 'preferred subfields' change at launch? | C4 |
| 18 | Align the §9.12 sign-in text with the terms (email address and a Google account ID). | a |
| 19 | Confirm at M2 that newsletter visits are counted only in total, without cookies, via UTM tags and Umami. | a |
| 20 | Which name should the takedown page use: 'Removal and correction requests' or 'Takedown'? | a |
| 21 | British or American spelling for the whole site? | default |
