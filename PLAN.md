# Gliagora | Neuroscience — Product and Technical Plan

| | |
|---|---|
| Version | 0.5 (draft for approval; answers up to round 4 applied, see §22.3) |
| Date | 2026-09-26 |
| Scope | Phases 1–4, with Phase 1 specified to build level |
| Status | Awaiting operator approval. No code is written until approval. At M0 this file becomes `PLAN.md` and a conventions file becomes `CLAUDE.md`. |

**Tags used in this plan**

- `[V]` verified against a current source on 2026-09-26 (see §15.4, verification log)
- `[U]` unverified, or verified only through secondary sources; re-check before relying on it
- `[DECISION]` needs an operator decision (collected again in §22)

**The five decisions that shape everything else**

1. **Personal data never leaves Turkey.** Every component that stores or transmits personal data (database, newsletter, SMTP relay, contact mailbox, backups, analytics) runs on Turkish-registered providers with data centres in Turkey. This avoids KVKK cross-border transfers entirely instead of managing standard contracts. Trade-off: slightly higher latency for distant visitors and a smaller choice of email providers (§11, §15). Interim exception: the contact address runs on Cloudflare Email Routing until M2 (§11.4).
2. **One app, one database, one server.** Next.js + Payload CMS + PostgreSQL in one repository, deployed with Docker Compose to a Turkish VPS; listmonk (newsletter) and Umami (cookieless analytics) run beside it (§11).
3. **Publisher, never intermediary.** Facts + own summary + link to the employer's own page. No applications, CVs, candidate data, fees, recruitment-agency ads or employer self-posting (§15).
4. **No third-party requests from public pages.** Fonts, map tiles, scripts and analytics are self-hosted, so there are no tracking cookies and no cookie banner (§11, §14, §18).
5. **Quiet everywhere, one signature moment.** A lazy-loaded 3D astrocyte on the home hero only; everything else is fast, server-rendered and content-first (§7, §10).

---

## 1. Summary and positioning

**One-liner.** Gliagora | Neuroscience is a curated, English-first hub that brings the common windows of neuroscience (positions, events, funding, papers, news and resources) under one roof, with one tag system that connects every subfield.

**Positioning statement.** For students and early-career neuroscientists looking for their next position, school or grant, Gliagora is the curated commons that gathers opportunities and knowledge from every subfield in one place. Unlike general academic job boards and single-society boards, every entry is checked against the original source, tagged with a shared cross-subfield taxonomy, and sends you straight to the original.

**Audience.** Primary: MSc and PhD applicants, PhD candidates, postdoc candidates. Secondary: established researchers (hiring visibility, funding calendar), clinicians (Bench to Bedside), the curious public (Learn).

**Tagline (chosen, decision D11): "Where neuroscience meets".**

| Candidate | Verdict | Reason |
|---|---|---|
| Where neuroscience meets | **Recommended** | It is literally what an agora is; short and verb-led; works with all three logo directions (ring, G, roof); translates cleanly (TR: "Sinirbilimin buluştuğu yer"). |
| The neuroscience commons | Reject | "Commons" suggests shared data infrastructure; Gliagora never hosts datasets, so the word over-promises. |
| Neuroscience, under one roof | Reject | Only matches logo direction 3; a roof contradicts the open square of the agora. |

**Name lockup rules** (because "glia" is not a household word):

- Logo lockup: mark + "Gliagora" wordmark + vertical rule + "Neuroscience".
- Page titles: `{Page title} – Gliagora | Neuroscience`. Home: `Gliagora | Neuroscience – Where neuroscience meets`.
- `og:site_name`, social display names, newsletter sender name: "Gliagora | Neuroscience" / "Glia Notes".
- The descriptor is never dropped, even in the favicon's accessible name.

**Differentiation**

| Principle | What it means in the product |
|---|---|
| Curation over volume | Every item is checked on the original page before publishing; expired items leave automatically; each item shows when it was last verified. |
| Cross-subfield | One taxonomy (subfield, method, model system, career stage, geography) powers lists, map, subfield hubs and newsletter preferences. |
| Early-career focus | MSc/PhD/postdoc filters first, "closing soon" badges, a funding eligibility finder, career guides (Phase 2). |
| Trust model | Facts + own summary + link; no fees, no applications, no paid placements; sources policy public. |
| Later multilingual | UI and evergreen content translated with human review; aggregated items keep their original language with an English summary. |

**North-star metrics:** confirmed newsletter subscribers; outbound clicks to original postings; returning visitors per month.

---

## 2. Sitemap, navigation model and URL structure

### 2.1 Locale and URL rules

- Locale subpaths from day one: `/en/` at launch; `/tr/` (Phase 2); `/es/`, `/de/`, `/fr/` only when data justifies (§12).
- `/` returns **308 → `/en/`**. No IP- or Accept-Language-based redirects; a dismissible banner may suggest a translated version when one exists.
- App-route slugs stay English across locales (`/tr/jobs/…`) for maintainability; article slugs may be localized later.
- Lowercase, hyphenated slugs; trailing slash enforced; content URLs end with a short stable ID where titles can change (`…-k3f9a`).
- `hreflang` only between pages that have a real, human-reviewed translation; `x-default` → `/en/`.
- Filter parameters create shareable URLs but are **not indexed** (canonical to the unfiltered list); curated landing pages are indexed instead (§16).

### 2.2 Sitemap

| Area | URL (EN) | Indexed | Phase |
|---|---|---|---|
| Home | `/en/` | Yes | 1a |
| Jobs list (+ map view) | `/en/jobs/` (`?view=map`) | Yes (base) | 1a |
| Job detail | `/en/jobs/{slug}-{id}/` | Yes while open; noindex 30 days after closing; then 410 | 1a |
| Suggest a listing | `/en/suggest/` | Yes | 1a |
| World map | `/en/map/` | Yes | 1a |
| Institution | `/en/institutions/{slug}-{rorId}/` (institutions without a ROR ID: `{slug}-{shortId}`, a 5-character ID) | Only with ≥1 active item (built in M3; `noindex` until M4 adds items) | 1a |
| Subfield hubs | `/en/subfields/`, `/en/subfields/{slug}/` | Yes (with human-written intro; skeletons built in M3 are `noindex`) | 1a (jobs only) → 1d (all windows) |
| Events | `/en/events/` (`?view=month&month=2026-11`) | Yes | 1b |
| Event detail | `/en/events/{slug}-{id}/` (+ `event.ics`) | Yes until end date + 30 days | 1b |
| Events feed | `/en/events/calendar.ics` | No | 1b |
| Funding (finder + list) | `/en/funding/` | Yes | 1b |
| Funding program | `/en/funding/{slug}/` | Yes | 1b |
| Papers of the month | `/en/papers/`, `/en/papers/{yyyy-mm}/` | Yes | 1c |
| News | `/en/news/` (list only; no detail pages, anchors per item) | Yes | 1c |
| Resources | `/en/resources/` (`?type=`) | Yes | 1d |
| Learn | `/en/learn/`, `/en/learn/{slug}/`, `/en/learn/bench-to-bedside/` | Yes | 1d |
| Authors | `/en/authors/{slug}/` | Yes | 1d |
| Newsletter | `/en/newsletter/`, `/check-your-inbox/`, `/confirmed/`, `/unsubscribed/` | Only `/en/newsletter/` | 1a |
| Newsletter archive | `/en/newsletter/archive/`, `/en/newsletter/{yyyy-mm}/` | Yes | 1a (first issue) |
| Search | `/en/search/?q=` | No | 1a |
| Sign in | `/en/sign-in/` | No | 1a |
| Account (saved items, digest settings, privacy: export and delete) | `/en/account/`, `/en/account/saved/`, `/en/account/privacy/` | No | 1a |
| About | `/en/about/`, `/en/about/sources/` | Yes | 1a |
| Contact and legal notice | `/en/contact/` (+ `/tr/iletisim/`) | Yes | 1a |
| Legal | `/en/legal/{privacy,cookies,terms,takedown,data-requests,accessibility}/` | Yes | 1a |
| Turkish legal texts | `/tr/legal/{kvkk-aydinlatma-metni,acik-riza-metni,…}/` | Yes | 1a |
| Admin | `/admin` (Payload) | No (robots + auth) | 1a |
| Machine files | `/sitemap.xml` (index), `/sitemaps/{type}.xml`, `/robots.txt`, `/en/jobs/feed.xml` | — | 1a |

### 2.3 Navigation model

**Header (desktop, sticky, compact on scroll):**

```
[Skip to main content]
(mark) Gliagora | Neuroscience   Jobs ▾  Events ▾  Funding  Papers  News  Resources ▾   [Search  Ctrl K]  [EN ▾]  [Get the monthly digest]
```

- The six windows are the only primary items. Items with sub-sections open a mega-menu through a **separate disclosure button**; the label itself is a real link (never `href="#"`).
- **Jobs ▾**: All positions; MSc; PhD; Postdoc; Research staff; Faculty and PI; Industry; Closing soon; Explore the map; Suggest a listing.
- **Events ▾**: All events; Conferences; Schools and courses; Online seminars; Month view; Subscribe to the calendar.
- **Resources ▾**: Datasets; Tools and software; Atlases; Statistics guides; Learn: basics; Bench to Bedside.
- Persistent CTA: "Get the monthly digest" (scrolls to/opens the signup; never a modal on page load).
- Search: `Ctrl/Cmd + K` opens a dialog; the header button works on touch and without the shortcut.
- Locale switcher: visible from launch with English only and "More languages coming"; it becomes a real menu in Phase 2.
- Account: "Sign in" link next to the locale switcher; after sign-in it becomes an account menu (Saved, Digest settings, Privacy, Sign out).

**Mobile:** logo lockup, search icon, menu button. The menu is a full-height disclosure panel: six windows (expandable), Map, Learn, About, then the CTA. Filters live in a bottom sheet (§7).

**Breakpoints and behaviour (built in M1):** the desktop header shows from 1280px, because the six windows, language menu and CTA need about 1,200px in Turkish; below that, the menu button opens the mobile panel, and below 768px the language list moves into the panel as well. Below 480px the menu button shows only its icon, as in §9.2, and keeps the name "Menu"; below 768px the digest button also moves from the header into the panel. The header has a fixed 64px height, so it is compact from the start and does not change on scroll. Menus are native disclosure elements (`<details>`), so they open without JavaScript; a small script adds Esc (closes and returns focus), close on outside click or focus, one open menu at a time, and the inert background of the mobile panel.

**Footer (sitemap footer):** Windows | Learn | About (About, Sources and editorial policy, Contact) | Legal (Privacy, KVKK texts, Cookies, Terms, Takedown, Data requests, Accessibility). The **Contact and legal notice** link appears on every page, including home (Law 5651, §15).

### 2.4 Shared filter model (URL encoding)

One `FilterState` type drives lists, the map, subfield hubs and (Phase 2) saved searches and newsletter preferences.

| Parameter | Values | Used by |
|---|---|---|
| `subfield`, `method`, `model` | comma-separated taxonomy slugs | all windows |
| `type` | comma-separated position type slugs (jobs, §4.5) or resource type slugs (resources, §4.7) | jobs, resources |
| `stage` | career stage slugs | jobs, events, funding |
| `country`, `region` | ISO 3166-1 alpha-2 / M49 region slug | jobs, events, map |
| `deadline` | `7d`, `14d` (the "Closing soon" menu entry, same threshold as the badge), `30d`, `90d`, `this-month`, `YYYY-MM-DD..YYYY-MM-DD` | jobs, events, funding |
| `etype`, `format`, `dtype` | event type, format, deadline type (each comma-separated) | events |
| `institution` | ROR ID, or the 5-character short ID of an institution without one (the ID at the end of its page address, §2.2) | jobs, events, map |
| `q` | free text | all |
| `sort` | `deadline` (default), `newest` | lists |
| `view` | `list`, `map`, `month` | jobs, events |
| `page` | integer | lists |

Example: `/en/jobs/?subfield=computational-theoretical,systems-circuits&type=phd&country=DE,NL&deadline=30d&view=map`

This is the canonical form (built in M4.3, `src/lib/filters/`): parameters in the order of the table, the values of a list sorted and separated by readable commas, defaults (`sort=deadline`, `view=list`, `page=1`) and empty values left out. Any other spelling of the same filters (repeated parameters from a plain form, another order or case, unknown parameters) gets a `308` to it, so each combination of filters has one address. Campaign tags (`utm_*`, §13, §16.4) are not filters: they are left out of the comparison and kept after the filters.

### 2.5 Status codes and lifecycle

| Situation | Response |
|---|---|
| Job past deadline (end of day in the institution's time zone; AoE if unknown) | Status `expired` within one hour; page shows "This position has closed" + similar open positions; `noindex`; removed from sitemap and lists |
| 30 days after closing | `410 Gone` |
| Withdrawn by employer or takedown | `410 Gone` immediately (or corrected) |
| Event ended | Stays 30 days (with "This event has ended"), then `410` |
| Institution with no active items | `200` + `noindex`, excluded from sitemap |
| Unknown URL | `404` with search and links to the six windows |
| Window or section not built yet | `200` placeholder page with `noindex`, so no header or footer link leads to a 404; replaced by the real page in its milestone |

How 410 works (built in M1): `src/proxy.ts` runs before every page under `/en/` and `/tr/`, checks the URL against the removed-URL list (`src/lib/gone.ts`) and shows a server-rendered "Page removed" page (`noindex`, links to the six windows) with status `410`. That list holds fixed paths only; listings that closed more than 30 days ago or were withdrawn get the same page and status from the record resolver below (built in M4.2). Pages that show a database record are resolved in the proxy too (built in M3, `src/lib/detail-routes.ts`), because Next.js 16.3 renders `notFound()` in a page only with JavaScript and a redirect must be sent before the page starts streaming: an unknown record gets the global 404 page with status `404`, a URL whose slug is missing or out of date gets a `308` to the current URL (the ID at the end stays the same; the query string is kept), and a retired subfield gets `410`. M4 added jobs to the same resolver (drafts and jobs in review are unknown: `404`; withdrawn jobs and jobs closed 30 days ago: `410`); M8 adds events.

---

## 3. Features per phase, acceptance criteria and phase gates

### 3.1 How Phase 1 is split into launchable steps

| Step | Contents | Why this order |
|---|---|---|
| **1a Core launch** | Home (static hero), Jobs, Suggest a listing, Map, Institutions, Newsletter, passwordless member accounts (saved items, digest preferences, self-service privacy), About, Contact/legal pages, admin core, basic search | The brief's core (Jobs + Map + Newsletter), accounts (moved from Phase 2, decision D7) and the legal minimum to go public. |
| **1b Deadlines** | Events (+ iCal), Funding calendar + eligibility finder, saved searches with job alerts, source monitors, link checker | Deadlines are the second reason to return; they feed the newsletter and the alerts. |
| **1c Research** | Papers of the month (PubMed, bioRxiv, OpenAlex queue), News, newsletter builder | Needs a working review queue first. |
| **1d Knowledge** | Resources, Learn, Bench to Bedside, author pages, subfield hubs for all windows | Evergreen content; slower to produce. |
| **1e Signature and hardening** | 3D hero (after the logo is final), accessibility and performance audit, restore drill | The hero depends on the final logo SVG; it is an enhancement, not a dependency. |

### 3.2 Phase 1 acceptance criteria

| Feature | Acceptance criteria | Step |
|---|---|---|
| Home | Server-rendered H1, subline, one primary action "Find positions", secondary link "Explore the map". Static poster hero works without JavaScript. Live counts (open positions, deadlines this month, institutions, countries) come only from the database, are cached ≤10 min, and each links to the matching filtered list. Only live windows are shown. Latest 6 positions and next 6 deadlines. Newsletter block near hero and before footer. LCP element is text. | 1a |
| Jobs list | 25 per page, server-rendered. All shared filters, synced to the URL and shareable. Removable chips + "Clear all". Sort: deadline (default) or newest. "Closing soon" badge at ≤14 days. Days left computed against end of deadline day in the institution's time zone (AoE if unknown); rolling or "until filled" deadlines labelled as such. Empty state offers: remove last filter, clear all, suggest a listing. Skeleton, error and offline states. Desktop: split list + map. Mobile: list, map toggle, bottom-sheet filters with a "Show N positions" button. | 1a |
| Job card | Title, institution, city and country, position type, deadline date + days left + deadline gauge, up to 3 tags (+N), primary action "View original posting" with an external-link icon and hidden text "(opens the employer's website)". Card title links to the detail page. | 1a |
| Job detail | Facts only: original title, institution (ROR), location, position type, career stage, deadline, start date if stated, original language, own 1–2 sentence summary, "Last verified" date, primary action to the employer's page, tags linking to subfield hubs, more at this institution, similar positions, "Report a problem" link. No JobPosting markup (§16). | 1a |
| Suggest a listing | URL (http/https only), content type, note ≤500 characters, optional email with an unticked consent checkbox. ALTCHA proof-of-work + honeypot + rate limit (5 per hour per hashed IP). Creates a Submission and a Candidate; never auto-publishes. Confirmation screen explains what happens next. Submitter email deleted 90 days after the decision. | 1a |
| Map | MapLibre with self-hosted basemap. Institution pins clustered; clicking a cluster zooms in; clicking an institution opens a side panel (desktop) or bottom sheet (mobile) with its filtered positions and events. Same filters as the list; list and map stay in sync. OSM attribution always visible. Map code loads only when the map is shown. Institutions only, never individuals. | 1a |
| Institution page | ROR name, city, country, website, ROR link, open positions, upcoming events, mini map. `noindex` when empty. No institution logos. | 1a |
| Newsletter | Signup in hero, pre-footer and `/en/newsletter/`. Double opt-in (confirmation link valid 7 days; unconfirmed addresses purged after 7 days). Consent record: timestamp, consent-text version, source form. Check-your-inbox, confirmed and unsubscribed pages. One-click unsubscribe (RFC 8058 headers) plus footer link. Archive page per issue. No open or click tracking. Minimum age 16 stated. | 1a |
| Member accounts | Sign in with Google (server-side redirect, scopes `openid email` only), ORCID (OpenID Connect; ORCID iD stored, name only if the member keeps it) or a one-time email link (15 minutes, single use). No passwords stored. Members keep saved positions, events and programs, digest on/off and preferred subfields. Accounts with the same verified email merge; ORCID can be linked from settings. Members join the digest with a separate checkbox; an email already verified at sign-in counts as the confirmation step (ORCID-only members verify an email first). Session cookie is strictly necessary (no banner). Member auth is separate from admin auth. | 1a |
| Self-service privacy | Unsubscribe: one click in every email or one switch in settings, immediate, confirmation page only. Delete account: button in settings; account, saved items, preferences and subscriber record deleted immediately; one final confirmation email. Export: JSON download in settings. Non-members: data-request page → email verification link → automatic deletion + confirmation. Other requests (correction, objection, takedown): instant automatic acknowledgement email and an admin task with a 30-day KVKK countdown (24-hour target for takedowns). Inactive accounts (24 months): warning email, deletion 30 days later. | 1a |
| Admin core | Payload collections for all Phase 1 entities; review queue (accept, reject, mark duplicate); duplicate warning on save; deadline tracker (next 14 days); hourly auto-expiry; audit log; second factor on admin login. | 1a |
| Source monitors | Scheduled pulls only from sources marked "automation allowed" (§6); results land as Candidates with dedupe; failures visible in a dashboard widget. | 1b |
| Link checker | Weekly check of every published external link; 404/410 or redirect-to-homepage flags the item; results in dashboard. | 1b |
| Saved searches and job alerts | Members save any filter combination; weekly (default) or daily alert with new matches only; one-click unsubscribe per alert; alerts link only to public items. | 1b |
| Events | List (grouped by month) and month view; filters incl. event type, format, deadline type; deadline badges (abstract, travel grant, registration, application); "Add to calendar" per event (ICS download, Google and Outlook links); site-wide iCal feed; Event markup only when eligible (§16). | 1b |
| Funding | Program pages with official link, own eligibility summary, next deadline(s) and a required "Last verified" date shown on every entry. Three-question finder (career stage, citizenship/residence, target region) returns "Matches" and "Check the conditions". Entries not re-verified within 120 days are flagged in admin; after 180 days they are hidden from the finder. | 1b |
| Papers of the month | Candidates from PubMed, bioRxiv and OpenAlex arrive in the review queue routed by subfield and pre-filtered to openly licensed papers (CC BY, CC BY-SA, CC0; licence stored and shown). A paywalled paper can still be added by hand as summary + DOI only. Monthly page with subfield tabs; each paper has our plain-language title, 120–200-word summary, "why it matters" line, DOI link; preprints labelled "Preprint – not peer reviewed". Abstract text is never published. | 1c |
| News | List only: own headline, own 2–3 sentence summary, source name, date, link; subfield tags; 10–20 items per month. | 1c |
| Newsletter builder | Admin view that pulls published items (deadlines in next 45 days, selected positions, papers, funding, news), renders the email and web archive from the same data, sends a test, then pushes the campaign to listmonk. | 1c |
| Resources | Typed entries (dataset, tool, atlas, standard, guide, course); own description, licence, cost, link; quarterly link check. | 1d |
| Learn | Articles with author credentials, last reviewed date, references (DOIs), not-medical-advice note. Bench to Bedside shows the evidence level prominently at the top and follows the research-translation rules in D19: no diagnosis, treatment or dosing advice; generic (active-substance) drug names only; every claim tied to a paper or trial-registry entry; a "Clinically reviewed" badge only when a clinician has actually reviewed the item. | 1d |
| Search | `Ctrl/Cmd+K` dialog and `/en/search/` page; PostgreSQL full-text search over all published types; grouped results; works without JavaScript via the form. | 1a basic → 1d all types |
| Signature hero | §10 storyboard, budgets and fallbacks met. | 1e |

### 3.3 Later phases (feature scope and key acceptance criteria)

| Phase | Feature | Key acceptance criteria |
|---|---|---|
| 2 | Accounts, saved items, saved searches, alerts, digest preferences | Moved to Phase 1 (decision D7) |
| 2 | Turkish locale | UI strings, legal pages, About, selected Learn articles, taxonomy labels; every translation human-reviewed; `hreflang` pairs only for translated pages. |
| 2 | Multilingual glossary (optional) | Term entries with definition and translations; linked from Learn. |
| 2 | Career guides and interviews | ≥1 guide per month (PhD applications, emailing PIs, PhD systems by country, industry and neurotech careers); interviews with written consent. |
| 3 | Opt-in profiles (ORCID sign-in exists from launch) | Publication import from ORCID only after consent; visibility per field (private, members, public); deleting the profile deletes everything. |
| 3 | "Who is where" | Directory and map aggregated at institution level only; no individual pins. |
| 3 | Collaboration board (members only) | Post types: analysis partner, method expertise, co-applicant (linked to funding programs); posts expire after 90 days; never hosts datasets or human data. |
| 3 | Moderation | Report button on every user item; notice-and-action queue; statements of reasons; terms of use; repeat-abuser handling; DSA readiness (§15). |
| 3 | ES, DE, FR | Only after the gate in §3.4. |
| 4 | Monthly live talk "Glia Talks" (D21) | Event page, registration with minimal data (email, optional name), reminders, calendar invites, written speaker consent for recording, recording + summary page. Platform choice is a KVKK decision (§15.2). |
| 4 | Sponsorship slots | Clearly labelled; tax registration and İYS registration completed before the first sponsored email (§15.3). |

### 3.4 Phase gates (proposed; tune after 3 months of data)

| Gate | Metrics (all required unless noted) | Also required |
|---|---|---|
| **Public launch (end of 1a)** | ≥150 active verified positions; ≥25 countries; ≥12 subfields represented; ≥50 institutions on the map | All legal pages live; SPF/DKIM/DMARC pass; CWV "good" in lab tests on staging; axe: 0 serious/critical issues; backup restore drill passed |
| **Phase 2** | ≥1,000 confirmed subscribers **or** ≥5,000 monthly visitors (3-month average); unsubscribe rate <1% per issue; curation ≤12 h/week for 8 consecutive weeks | Phase 1 steps 1a–1d live |
| **Turkish locale** | ≥8% of sessions from Turkish-language browsers **or** ≥300 Turkish-locale subscribers | A reviewer for Turkish copy (the operator) |
| **Phase 3** | ≥5,000 subscribers; ≥25,000 monthly visitors; ≥500 accounts with ≥30% monthly active | DSA and GDPR representative decision made and budgeted; moderation time ≤3 h/week or a second moderator |
| **ES / DE / FR (each)** | ≥10% of sessions from that language for 3 consecutive months | A native reviewer for that language |
| **Phase 4** | ≥10,000 subscribers **or** ≥50,000 monthly visitors; ≥3 speakers committed | Tax registration before any revenue; talk-platform decision (§15.2) |

---

## 4. Full taxonomy

### 4.1 Principles

- One vocabulary set shared by every content type; each term has a stable slug, localized label and description, synonyms (for search and AI suggestions) and optional mappings (MeSH terms, OpenAlex topic IDs) used to route paper candidates.
- Terms can have a parent (e.g., `rodent` → `mouse`, `rat`); filters match parents inclusively.
- Every published item needs ≥1 subfield; jobs also need a position type; Bench to Bedside needs an evidence level.
- New terms only through admin with a changelog; slugs never change once published (redirect if merged).

### 4.2 Subfield (each gets a hub page)

| Slug | Label | Covers (examples) |
|---|---|---|
| `molecular-cellular` | Molecular and cellular | signalling, ion channels, neuronal cell biology |
| `synapses-plasticity` | Synapses and plasticity | transmission, LTP/LTD, homeostatic plasticity |
| `glia` | Glial biology | astrocytes, microglia, oligodendrocytes, myelin |
| `neurogenetics` | Neurogenetics and genomics | genetic risk, gene regulation, cell atlases |
| `developmental` | Developmental | neurogenesis, migration, axon guidance, critical periods |
| `systems-circuits` | Systems and circuits | circuit dynamics, population coding, connectivity |
| `sensory` | Sensory systems | vision, audition, touch, olfaction, pain processing |
| `motor` | Motor systems | motor control, basal ganglia, cerebellum, spinal circuits |
| `cognitive` | Cognitive | attention, memory, decision-making, language |
| `affective-social` | Affective and social | emotion, motivation, reward, social behaviour |
| `behavioral` | Behavioural and neuroethology | natural behaviour, learning, ethology |
| `computational-theoretical` | Computational and theoretical | models, theory, NeuroAI |
| `integrative-physiology` | Integrative physiology | sleep, circadian, neuroendocrine, autonomic |
| `neuroimmunology` | Neuroimmunology | neuroinflammation, brain–immune interactions |
| `neuropharmacology` | Neuropharmacology | drug mechanisms, receptor pharmacology |
| `clinical-translational` | Clinical and translational | neurology, psychiatry, neurosurgery research, biomarkers |
| `neurotechnology-bci` | Neurotechnology and BCI | neural interfaces, neuromodulation devices, neuroprosthetics |
| `evolutionary-comparative` | Evolutionary and comparative | brain evolution, comparative neuroanatomy |
| `neuroethics-society` | Neuroethics, education and society | ethics, science communication, history, policy |

### 4.3 Method

| Group | Slugs (label) |
|---|---|
| Recording and imaging | `electrophysiology` (Electrophysiology, incl. patch clamp, extracellular, large-scale probes), `optical-imaging` (Microscopy and optical imaging, incl. two-photon, light-sheet, calcium/voltage imaging), `em-connectomics` (Electron microscopy and connectomics), `mri-fmri` (MRI and fMRI), `eeg-meg` (EEG and MEG), `pet-spect` (PET and SPECT), `intracranial-human` (Intracranial recordings in humans) |
| Manipulation | `opto-chemogenetics` (Opto- and chemogenetics), `brain-stimulation` (TMS, tDCS, DBS, focused ultrasound), `genetic-tools` (CRISPR, viral vectors, transgenics) |
| Molecular | `omics` (Genomics, transcriptomics, proteomics, epigenomics), `single-cell-spatial` (Single-cell and spatial omics), `biochemistry-structural` (Biochemistry and structural biology), `anatomy-histology` (Neuroanatomy, tracing, tissue clearing, histology) |
| Behaviour and clinical | `behavioral-assays` (Behavioural assays), `psychophysics-tasks` (Psychophysics and cognitive tasks), `clinical-trials` (Clinical research and trials), `epidemiology-cohorts` (Epidemiology and cohort studies) |
| Computational | `computational-modeling` (Modelling and simulation), `machine-learning` (Machine learning and AI), `statistics-data-science` (Statistics and data science), `neuroinformatics` (Data standards and pipelines, e.g., BIDS, NWB) |
| Engineering | `device-engineering` (Electrodes, hardware, neural interface engineering) |

### 4.4 Model system

`human` (Human participants), `human-tissue` (Human tissue, post-mortem or surgical), `non-human-primate`, `rodent` → `mouse`, `rat`, `other-mammals`, `birds`, `zebrafish`, `amphibians`, `drosophila`, `c-elegans`, `other-invertebrates`, `cell-culture` (Primary cells and cell lines), `ipsc-organoids` (iPSC-derived cells and organoids), `in-silico`, `not-applicable`.

### 4.5 Position type and career stage

| Position type (jobs) | Includes | Career stage (people; funding, events, preferences) |
|---|---|---|
| `msc` MSc | taught and research master's places | `student` BSc/MSc student |
| `phd` PhD | PhD positions, doctoral programmes, doctoral network posts | `phd-candidate` PhD candidate |
| `postdoc` Postdoc | postdoctoral researcher, research fellow | `early-postdoc` ≤3 years after PhD |
| `research-staff` Research staff | research assistant, technician, lab manager, data scientist, research engineer | `postdoc` 3–7 years after PhD |
| `faculty-pi` Faculty and PI | lecturer, assistant/associate/full professor, group leader | `independent` 7+ years or independent |
| `industry` Industry | R&D, applications, clinical science, data roles | `research-staff`, `industry-professional` |

### 4.6 Geography and country sets

- `country`: ISO 3166-1 alpha-2, plus `XK` (Kosovo) and `TW` (Taiwan), which M49 does not list but ROR and funders use. `region`: UN M49 (Africa; Northern America; Latin America and the Caribbean; Asia; Europe; Oceania) with subregions (the M49 sub-regions; for Sub-Saharan Africa and Latin America the intermediate regions). Country names in English and Turkish come from Unicode CLDR.
- `CountrySet` for funding eligibility, each with `sourceUrl` and `lastVerifiedAt`: `eu27`, `horizon-europe-associated`, `embc-members`, `world-bank-lmic` (updated each July). Entered in M3 and checked against their official sources on 2026-09-27 `[V]`: `horizon-europe-associated` holds the 19 countries associated to the whole programme; Canada, Japan, New Zealand and the Republic of Korea (Pillar II only) and Morocco (association being processed) are named in the set's note instead; `embc-members` holds the 32 member states (associate members India, Singapore and Taiwan in the note); `world-bank-lmic` holds the low, lower-middle and upper-middle income economies of fiscal year 2027. M9 checks every set again before the funding finder relies on it.
- Institutions come from ROR (CC0, with coordinates) `[V]`; non-ROR organizations (e.g., small companies) are created manually with coordinates entered by hand.

### 4.7 Supporting vocabularies

| Vocabulary | Terms |
|---|---|
| Event type | `conference`, `symposium-workshop`, `school` (summer/winter school), `course` (hands-on or computational), `online-seminar`, `hackathon`, `career-event` |
| Event format | `in-person`, `online`, `hybrid` |
| Deadline type | `abstract`, `travel-grant`, `registration-early`, `registration`, `application`, `fee-waiver` |
| Funding type | `individual-fellowship`, `research-grant`, `travel-mobility`, `small-grant`, `prize` |
| Resource type | `dataset-repository`, `software-tool`, `atlas-reference`, `data-standard`, `guide-tutorial`, `course`, `community` |
| Evidence level | `cell-molecular`, `animal`, `human-observational`, `clinical-trial`, `mixed` (lists each level) |
| Disease area (optional; clinical and Bench to Bedside) | `neurodegenerative`, `neurodevelopmental`, `psychiatric`, `epilepsy`, `stroke-vascular`, `pain-headache`, `sleep-disorders`, `neuroinflammatory-demyelinating`, `neuro-oncology`, `sensory-disorders`, `injury-trauma`, `rare-neurogenetic` |

---

## 5. Data model

PostgreSQL 16+ managed through Payload collections (TypeScript schema in the repo). Subscribers live in listmonk's own PostgreSQL database on the same server; the app stores only listmonk subscriber UUIDs.

### 5.1 Entities

| Entity | Key fields | Relations and notes |
|---|---|---|
| `Institution` | `rorId` (unique, nullable), `shortId` (unique; institutions without a ROR ID, for their URL), `name`, `slug` (from the name), `aliases[]`, `types[]`, `country` (the `Country` code), `city`, `lat`, `lng`, `website`, `status` (active/inactive/withdrawn, as in ROR), `origin` (ror/manual), `rorRelease`, `rorLastModified` | 1–n Job, Event, Venue; cached counts of active items (M4) |
| `Country` | `code` (the record's ID), `name` (localized), `region`, `subregion`, `m49Code` | n–n `CountrySet` |
| `CountrySet` | `slug`, `label` (localized), `description` (localized), `countries[]`, `sourceUrl`, `lastVerifiedAt`, `verificationNote` | used by funding eligibility; every change kept as a version |
| `Term` | `vocabulary`, `slug`, `label` (localized), `description` (localized), `parent`, `group` (methods only, §4.3), `synonyms[]`, `mappings{mesh[], openalexTopics[]}`, `hubIntro` (localized; subfields only, §16.3), `isActive`, `sortOrder` | n–n with all content types; slug unique per vocabulary and fixed once saved; never deleted (deactivated instead); every change kept as a version |
| `Job` | `shortId`, `slug`, `status`, `title`, `originalLanguage`, `institution`, `locationOverride`, `country` and `city` (computed from the override, else the institution), `positionType`, `careerStages[]`, `subfields[]`, `methods[]`, `modelSystems[]`, `deadlineKind` (fixed/rolling/until-filled), `deadlineDate` (a calendar day), `deadlineTz` (the institution's zone, or the posting's; empty if unknown: AoE), `deadlineAt` (computed: when the deadline day ends), `startText`, `summary` (EN, ≤280 chars), `originalUrl`, `canonicalUrl`, `fingerprint`, `duplicateOf`, `confirmNotDuplicate` (not stored), `checks` (the §6.4 checklist), `source` (M7), `submission` (M4.4), `verifiedAt`, `lastCheckedAt`, `linkStatus`, `publishedAt`, `expiredAt`, `withdrawnAt`, `aiAssisted`, `internalNotes` | n–1 Institution; n–1 Source (from M7); every change kept as a version |
| `Event` | `slug`, `status`, `title`, `eventType`, `format`, `startDate`, `endDate`, `timezone`, `venue` or `institution`, `organizerName`, `officialUrl`, `summary`, `openRegistration`, `subfields[]`, `methods[]`, `careerStages[]`, `verifiedAt`, `linkStatus` | 1–n `EventDeadline` (`type`, `date`, `tz`, `note`, `url`) |
| `Venue` | `name`, `city`, `countryCode`, `lat`, `lng`, `institution?` | for events outside institutions |
| `FundingProgram` | `slug`, `name`, `funder` (Institution or text), `summary`, `officialUrl`, `fundingType`, `amountText`, `durationText`, `eligibility` (below), `cadence`, `lastVerifiedAt` (required), `verificationNote`, `status` | 1–n `FundingCall` (`callId`, `opensAt`, `closesAt`, `url`) |
| `eligibility` (JSON) | `stages[]`, `yearsSincePhd{min,max}`, `citizenship{mode, countries[], sets[]}`, `residence{mode, countries[], sets[], mobilityRuleText}`, `hostRegions{mode, regions[], sets[]}`, `needsManualCheck` | drives the finder's "Matches" vs "Check the conditions" |
| `Paper` | `doi` (unique), `pmid`, `openalexId`, `isPreprint`, `venue`, `title` (original), `plainTitle` (ours), `authorsShort`, `publishedDate`, `license`, `summary` (ours), `whyItMatters`, `subfields[]`, `methods[]`, `modelSystems[]`, `evidenceLevel`, `issue` | n–1 `PapersIssue` (`month`, `intro`, `publishedAt`) |
| `NewsItem` | `headline` (ours), `summary` (ours), `sourceName`, `sourceUrl`, `sourceDate`, `subfields[]`, `publishedAt` | — |
| `Resource` | `name`, `type`, `description` (ours), `url`, `license`, `cost`, `subfields[]`, `methods[]`, `modelSystems[]`, `lastCheckedAt`, `linkStatus` | — |
| `Article` | `slug`, `title`, `dek`, `body` (rich text), `series`, `evidenceLevel`, `diseaseAreas[]`, `authors[]`, `reviewers[]`, `references[]` (DOIs), `lastReviewedAt`, `locale versions` | n–n `Author` (`name`, `credentials`, `affiliation`, `orcid`, `bio`, `consentToPublish`) |
| `Source` | `name`, `kind` (rss/api/manual/mailing-list), `baseUrl`, `contentKinds[]`, `automationAllowed`, `tosUrl`, `tosCheckedAt`, `robotsCheckedAt`, `schedule`, `rateLimit`, `lastRunAt`, `lastSuccessAt`, `errorCount`, `notes` | 1–n Candidate |
| `Candidate` | `kind` (job; the other kinds join with their windows), `source` (M7), `rawUrl`, `canonicalUrl`, `rawTitle`, `institution` (needed to accept), `extracted` (JSON), `snippet` (internal only, purged 30 days after decision), `fingerprint`, `possibleDuplicates` (jobs) and `possibleDuplicateCandidates` (computed on every save), `duplicateOf` (a job), `aiSuggestion` (JSON, M7), `status`, `decisionReason` (required to reject), `decisionNote`, `decidedAt`, `publishedRef` (the draft job made on accept), `submission` | review queue; never deleted; every change kept as a version |
| `Submission` | `url`, `kind`, `note`, `email?` (stored only with consent), `consentToContact`, `locale`, `status` (new/queued/decided), `candidate`, `decidedAt`, `emailPurgeAt`, `notifiedAt` (M4.7) | from "Suggest a listing"; created only by the form; deleted on a data request |
| `NewsletterIssue` | `month`, `subject`, `preheader`, `intro`, `sections` (refs to published items), `status`, `listmonkCampaignId`, `sentAt`, `archiveSlug` | archive page renders from the same record |
| `ConsentLog` | `subscriberUuid`, `event` (requested/confirmed/unsubscribed), `consentVersion`, `at`, `source` | no email address stored in the app DB |
| `DataRequest` | `type`, `email`, `details`, `receivedAt`, `dueAt`, `status`, `resolvedAt` | retention 2 years after closure `[U]` |
| `TakedownRequest` | `itemRef`, `reason`, `email`, `details`, `receivedAt`, `respondBy`, `status`, `action` | §15 |
| `LinkCheck`, `AuditLog` | url/status history; actor, action, entity, time | operations |
| `User` (admin) | `email`, `role` (admin, editor), second factor | Payload auth; separate from members |
| `Member` | `email` (verified), `displayName?`, `orcidId?`, `digestOptIn`, `subfieldPrefs[]`, `createdAt`, `lastSeenAt`, `deletionWarnedAt?` | 1–n `AuthAccount` (`provider`, `providerAccountId`), `Session`, `SavedItem` (`itemType`, `itemId`); `VerificationToken` for email links |
| Phase 1b | `SavedSearch` (`filterState`, `frequency`), `AlertRun` | member-owned |
| Phase 3 | `Profile` (`orcid`, `displayName`, `institution`, `subfields[]`, `visibility`), `Publication`, `CollabPost`, `Report`, `ModerationAction` | DSA records |
| Phase 4 | `Talk`, `Speaker` (`recordingConsent`), `Registration`, `Recording` | minimal data |

### 5.2 Status enums

- Content: `draft` → `in_review` → `published` → (`expired` | `withdrawn`); every transition logged.
- Candidate: `new` → `triaged` → (`accepted` | `rejected` | `duplicate`).
- Link status: `ok`, `redirect`, `broken`, `gone`, `unchecked`.

### 5.3 Shape at a glance

```
Source ─1:n─ Candidate ─1:1─ (Job | Event | FundingProgram | Paper | NewsItem | Resource)
Submission ─1:1─ Candidate
Institution ─1:n─ Job, Event, Venue          Term ─n:n─ every content type
FundingProgram ─1:n─ FundingCall             Event ─1:n─ EventDeadline
PapersIssue ─1:n─ Paper                      Article ─n:n─ Author
NewsletterIssue ─refs→ published items       listmonk.subscriber ←uuid─ ConsentLog
```


---

## 6. Sources and curation workflow

### 6.1 Automation policy

1. A source may be polled automatically **only** if it is an official feed or API **and** its terms of use and `robots.txt` allow it. The admin `Source` record stores the terms URL and the dates both were checked. Anything else is read by a human.
2. **Job boards are never scraped or bulk-imported**, whatever their terms say. They are used to discover a position; Gliagora then links to the **employer's own page** (EU sui generis database right; CJEU C-762/19 found that copying and re-using a substantial part of a job site's database can infringe where it harms the maker's investment `[V]`).
3. Only **employer-origin** listings are published (universities, institutes, companies). Listings placed by recruitment agencies are skipped (Law 4904 forbids publishing ads of unlicensed intermediaries, §15 `[V]`).
4. Public output is always: facts + our own words + link. Never copied descriptions, abstracts, images or logos.

### 6.2 Source register (initial)

| Source | Content | Access method | Legal handling | Frequency |
|---|---|---|---|---|
| Employer career pages (universities, institutes, companies) | Jobs | Manual; official RSS/Atom only where offered and allowed | Facts + own summary + link to that page | Daily skim of saved searches |
| EURAXESS | Jobs, funding | Manual discovery; automation only if its terms allow `[U]` | Discovery only; link to the employer's original posting | Daily |
| Academic job boards (e.g., Nature Careers, Science Careers, jobs.ac.uk, AcademicPositions, FindAPhD) | Jobs | Manual reading only | Discovery only; nothing republished from their database | 2–3× per week |
| Society boards (e.g., SfN, FENS, OHBM, CNS, INCF, IBRO) | Jobs, events | Manual; RSS only if allowed `[U]` | As above | Weekly |
| Mailing lists (e.g., Connectionists, comp-neuro) | Jobs, events | Subscribed with a project mailbox (hosted in Turkey) | Announcement only; verify on the employer page | Daily digest |
| Social media | Jobs, events | Manual | Verify at source | Ad hoc |
| "Suggest a listing" | All | Site form | Verify at source; never auto-publish | Daily queue |
| Event organizers and society calendars (e.g., FENS Forum, SfN, OHBM, Cosyne, Bernstein, CSHL, MBL, EMBO courses, CAJAL, Neuromatch Academy) | Events | Manual; iCal/RSS where offered and allowed | Facts + own summary + link; all deadlines checked on the official page | Weekly |
| Funders' official pages (MSCA incl. Doctoral Networks, ERC, EMBO, HFSP, Humboldt, Wellcome, NIH, DAAD and others) | Funding | Manual | Own summary; "last verified" date; link to the official call | Quarterly, plus 30 days before each deadline |
| PubMed via NCBI E-utilities | Paper candidates | API (`esearch`, `esummary`, `efetch`) with MeSH and keyword queries per subfield; API key; registered `tool` and `email`; ≤10 requests/s; large jobs off-peak `[V]` | Metadata public; abstracts visible only in admin for triage, deleted after the decision; publisher copyright on abstracts respected; licence resolved by DOI and only CC BY, CC BY-SA or CC0 kept | Daily |
| bioRxiv API | Preprint candidates | `/details/biorxiv/{from}/{to}/{cursor}` with the neuroscience category filter; no key `[V]` | Licence field filters candidates (CC BY, CC BY-SA, CC0 only); "Preprint – not peer reviewed" label | Daily |
| OpenAlex API | Paper candidates, topics | Free API key (daily allowance of about $1: unlimited single lookups, ~10,000 list/filter calls, ~1,000 searches; `mailto` polite pool retired in Feb 2026) `[V]` | CC0 metadata; also resolves each candidate's open-access licence by DOI (free single lookups) `[U]` exact fields | Weekly |
| Crossref REST API | DOI metadata for manual adds | API with contact email `[U]` | Metadata only | On demand |
| ROR data dump (Zenodo) | Institutions | Import of the schema-v2 JSON dump, streamed (about 140,000 records, 320 MB unpacked; the first import takes about 15 minutes, later ones only change what changed in ROR); ROR API v2 for single lookups when an editor adds an institution by its ROR ID (API v1 retired Dec 2025) `[V]`. Withdrawn records are not added; records are never deleted. The state of the last import is shown in the admin (System → ROR import) | CC0; credit anyway (institution pages credit ROR) | The server checks Zenodo every night and imports a new release (ROR publishes about monthly) |
| News outlets and press offices | News | RSS for discovery | Our own headline + our own 2–3 sentences + link; no images | Daily skim, weekly publishing |
| Resource projects (e.g., OpenNeuro, DANDI, MNE-Python, FreeSurfer, FSL, SPM, DeepLabCut, Suite2p, Allen Brain Atlas, EBRAINS) | Resources | Manual | Link + own description + licence as stated by the project | Quarterly link check |

### 6.3 Pipeline

```
Monitors (scheduled jobs) ──► normalise ──► dedupe ──► Candidate(new)
Suggest-a-listing form ─────────────────────────────► Candidate(new)
Manual add (admin) ─────────────────────────────────► Candidate(new)
                                          │
                        Review queue: open original ▸ verify facts ▸ tag ▸ write summary
                                          │
                       accept ─► Job/Event/... (published)     reject / duplicate ─► archived
                                          │
          Hourly: auto-expire   Weekly: link check   Quarterly: funding re-verification
                                          │
                     Monthly: newsletter builder pulls from published items
```

- **Dedupe:** canonical URL (https scheme, lower-case host, strip tracking parameters and fragments, normalise trailing slash) + trigram title similarity ≥0.8 with the same institution and deadline → "likely duplicate" warning.
- **Tag suggestions without AI:** a local matcher compares titles and descriptions with term synonyms and proposes tags. No external calls, no cost.
- **Verification rule:** a deadline or eligibility fact is published only after it is seen on the original page; the date it was seen becomes `verifiedAt`.

### 6.4 Editorial checklist (enforced by required fields)

Original page reachable; employer-origin; position still open; deadline confirmed; ≥1 subfield + position type; own summary ≤280 characters with no copied sentences; no personal contact details copied (the reader contacts the employer through the original page); no logos or images.

### 6.5 Routine

| Cadence | Task | Time |
|---|---|---|
| Daily (weekdays) | Clear review queue, publish 8–12 positions | 30–45 min |
| Weekly | Events and news batch, link-check fixes, source health | 2–3 h |
| Monthly | Papers of the month (select 5–8, write summaries), newsletter | 5–7 h |
| Quarterly | Funding re-verification, resource link review, taxonomy review | 3–4 h |

### 6.6 AI assistance (Claude API): decided, listings + papers, operator approves every item

| Content | What is sent | What comes back | Safeguards |
|---|---|---|---|
| Papers (open licence only) | Title, abstract and main text; author list, affiliations, correspondence, acknowledgements and references removed first (they contain names and emails) | Draft plain-language title, 120–200-word summary, "why it matters", tag suggestions | Runs only after the licence filter; no personal data expected |
| Listings (jobs, events, funding) | Title and description with emails, phone numbers and personal names replaced by placeholders (e.g., "Smith Lab" → "[PI] Lab") | Draft 1–2 sentence summary, extracted facts (deadline, position type, location), tag suggestions | Facts always checked against the original page; the redacted text that was sent is stored with the candidate for audit; if redaction cannot run (e.g., scanned PDF), the item is drafted by hand |

- Nothing is published without the operator's approval; the operator edits the text and holds editorial responsibility. The sources policy says that AI assists drafting.
- KVKK: the API runs outside Türkiye, so redaction is the safeguard. It lowers but cannot fully remove the chance that a name slips through (accepted risk, §15.2 flag 6). Whether Anthropic signs the KVKK standard contract is unverified `[U]`; assume it does not.
- Cost `[V]` (official pricing: Claude Sonnet 5 $2/$10 and Claude Haiku 4.5 $1/$5 per million input/output tokens; Batch API −50%; Claude 4.7+ models use a tokenizer that yields roughly 30% more tokens):
  - Listings, ~700 per month at ~2,500 input and ~250 output tokens each: about $3 (Haiku 4.5) to $7 (Sonnet 5) per month.
  - Papers, ~30 per month at ~15,000 input and ~600 output tokens each: about $1–2 per month.
  - Nightly drafts through the Batch API roughly halve these; a hard monthly spend limit (e.g., $15) is set in the Claude Console.

---

## 7. Design system

### 7.1 Principles

1. **The interface is the slide, the content is the specimen.** Clear glass, precise labels, one fluorescent highlight.
2. **Structure carries information.** Borders, gauges and badges exist only when they encode something (deadline, status, evidence level).
3. **One loud moment.** The home hero is the only autonomous motion; everything else answers the user.
4. **Readable first.** Hyperlegible body type, AA contrast by construction, 60–72 character lines.

### 7.2 Colour tokens (final)

Contrast ratios computed with the WCAG 2.1 formula. The test `src/app/(frontend)/tokens.test.ts` reads the tokens from `tokens.css` and checks every pair below in CI.

| Token | Light | Dark | Use | Minimum contrast on its surfaces |
|---|---|---|---|---|
| `--bg` | `#EEF0F4` cool paper | `#161942` night | page | — |
| `--surface` | `#FFFFFF` | `#1E2152` | panels, inputs | — |
| `--surface-sunken` | `#E3E6EE` | `#11143A` | filter bar, chips | — |
| `--surface-raised` | `#FFFFFF` + overlay shadow | `#272B63` | menus, dialogs, sheets | — |
| `--text` | `#1E2152` indigo ink | `#E9EBF4` | body text | 12.1 / 10.9 |
| `--text-muted` | `#4A4F72` | `#AEB3D2` | metadata | 6.3 / 6.3 |
| `--accent` | `#B8286E` GFAP magenta | `#F06AAE` | primary actions, brand highlights | 4.7 on sunken, 5.2 on paper / 4.6 on raised, 5.9 on night |
| `--on-accent` | `#FFFFFF` | `#161942` | text on accent | 5.9 / 5.9 |
| `--link` | `#146992` (new) | `#5CC8EC` | links, small blue text | 4.9 / 6.8 |
| `--dapi` | `#1777A6` DAPI blue | `#5CC8EC` | focus ring, map and chart graphics (non-text) | 4.0 / 6.8 (≥3:1 required) |
| `--line` | `#D3D6E0` | `#2F346B` | decorative dividers only | n/a |
| `--line-strong` | `#7C809E` | `#7479AD` | input and control borders | 3.09 / 3.15 (≥3:1 required) |
| `--badge-bg` / `--badge-text` | `#F8E4EE` / `#9C1F5B` | `#3A1F4F` / `#F59BC6` | "Closing soon" | 6.3 / 7.0 |
| `--danger` | `#B3261E` | `#FF8A80` | errors | 5.7 / 6.6 |
| `--success` | `#1E754A` | `#6FD39C` | confirmations | 4.55 / 7.1 (lowest on any surface) |
| `--warning` | `#8A5300` | `#F2B660` | warnings | 5.6 / 9.3 |

Findings from the check:

- `--success` was `#1F7A4D`, which is only 4.26:1 on `--surface-sunken`; it was darkened to `#1E754A` (same hue), which reaches at least 4.5:1 on every surface, including the badge background (D25).
- DAPI blue `#1777A6` on cool paper is **4.36:1**, below AA for normal text. It stays for non-text uses (focus rings, pins), and links use the darker `#146992` (≥4.85:1 on every light surface).
- Indigo, magenta and both dark-mode tints pass AA as provided.
- Magenta and DAPI blue have almost the same luminance (1.18:1), so the map and badges never distinguish them by colour alone (shape + text always).
- Dark mode follows `prefers-color-scheme` and uses the night palette; the magenta/cyan pair on night echoes GFAP/DAPI fluorescence.

### 7.3 Typography

| Role | Family | Settings |
|---|---|---|
| Display (H1–H2, hero, stats) | **Commissioner** (variable, SIL OFL) | Flair axis ~50–70 so terminals flare like inscribed lettering around the agora; weight 600–700; tight tracking −0.01em at large sizes |
| Body and UI | **Atkinson Hyperlegible Next** (SIL OFL) | 400/500/700 + italic; distinct I/l/1 and O/0 help with DOIs, dates and codes |
| Email | System stack (`Georgia, 'Times New Roman', serif` for headings; `Arial, Helvetica, sans-serif` for body) | web fonts are unreliable in email clients |

- Self-hosted WOFF2 through `next/font/local`, subset to Latin + Latin Extended (Turkish ğ ş ı İ, German, Spanish, French), with metric-adjusted fallbacks to avoid layout shift. No Google Fonts CDN. `[U]` Check axis tags and glyph coverage in the downloaded builds.
- Fallback stack after each self-hosted font and its metric-adjusted Arial fallback: `'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Noto Sans', 'DejaVu Sans', system-ui, sans-serif` (`--font-fallback` in `tokens.css`). Every font in it has ₺ and ə, which Atkinson Hyperlegible Next lacks; browsers draw those two glyphs from the first installed one (Windows, Apple, Android, then Linux). Accepted (D25).
- No monospace UI labels; DOIs and IDs use the body face.

| Step | Size | Use |
|---|---|---|
| −1 | 0.875rem (14px) | metadata, captions (minimum size) |
| 0 | 1.0625rem (17px) | body, line-height 1.6 |
| 1 | 1.25rem | card titles, H4 |
| 2 | 1.5625rem | H3 |
| 3 | clamp(1.75rem, 1.3rem + 1.6vw, 2.44rem) | H2 |
| 4 | clamp(2.2rem, 1.5rem + 3vw, 3.5rem) | H1 |
| 5 | clamp(2.6rem, 1.6rem + 5vw, 5.2rem) | hero display |

Rules: sentence case everywhere; no all-caps labels; no single word styled differently inside a headline; left-aligned text; measure 60–72 characters (set in rem, `--measure: 36rem`, because `ch` changes with the loaded font); tabular figures in counters and tables where the font supports them `[U]`.

### 7.4 Space, shape, depth and motion

| Scale | Values |
|---|---|
| Spacing (4px base) | 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 |
| Radius (hierarchy, not one radius everywhere) | 0 list rows and full-bleed sections; 4px buttons and inputs; 10px overlays (dialogs, sheets, popovers); pill for chips and badges; circle for map clusters |
| Elevation | Resting content has none; one ink-tinted overlay shadow (`0 8px 24px rgb(22 25 66 / 0.18)`; dark: `0 8px 24px rgb(0 0 0 / 0.5)`) |
| Motion | 120ms / 200ms / 320ms, `cubic-bezier(0.2, 0, 0, 1)`; responsive motion only (menus, sheets, chip removal); `prefers-reduced-motion` removes transforms |
| Breakpoints | 480, 768, 1024 (list + map split starts), 1280, 1536; container max 1280px |
| Grid | 12 columns desktop, 4 mobile; gutters 16/24/32 |
| Z-index | header 100, dropdown 200, sheet 300, dialog 400 |

Icons: Lucide (ISC licence), 20/24px, always paired with text except close and search buttons, which have accessible names. Compact header controls (built in M1) use 16–18px icons: the chevron buttons that open the mega-menus (named, e.g., "Jobs menu"), the language button (globe and code, named "Language: English (EN)") and, below 480px, the menu button (named "Menu"). Imagery: CC0 / CC BY / CC BY-SA micrographs and photos only, with creator, source, licence and changes stored in the Media collection and shown as a caption; no institution logos, no stock photos of people, no AI images presented as real micrographs.

### 7.5 Component inventory

| Component | Anatomy | States | Accessibility |
|---|---|---|---|
| Skip link | "Skip to main content" | hidden until focused | first focusable element |
| Header + mega-menu | lockup, six windows, disclosure buttons, search, locale, CTA | open, closed, active page | disclosure pattern; `Esc` closes and returns focus; no hover-only access; label links go to real pages |
| Mobile menu | full-height panel | open, closed | background `inert`; focus to first item |
| Search dialog | input, grouped results, hints | empty, loading, results, no results | `Ctrl/Cmd+K`; combobox + listbox; results count announced |
| Locale switcher | menu button | current, available, "coming soon" | `lang` on each option |
| Buttons | primary (accent), secondary (outline), tertiary (text) | hover, focus, pressed, busy | 2px `--dapi` focus ring with 2px offset; busy state announced |
| Filter bar | popovers with checkbox lists; search inside long lists | default, applied, open | result count in a polite live region |
| Filter chips | label + remove button; "Clear all" | default, focus | each chip is a button "Remove filter: PhD" |
| Bottom sheet (mobile filters) | handle, title, sections, footer actions | half, full, closed | dialog semantics, focus trap, "Show 38 positions" |
| Job row (card) | title, institution, place, type, deadline + gauge, tags, primary action | default, closing soon, rolling deadline, expired | gauge is decorative; text states days left |
| Deadline badge | type + date | upcoming, closing soon, passed | text first; icon decorative |
| Event row | date block, title, place/online, type, deadline badges, add to calendar | upcoming, ongoing, ended | month view has a list alternative |
| Add-to-calendar menu | ICS download, Google, Outlook | — | menu button |
| Funding finder | three fieldsets, results, disclaimer | incomplete, results, no match | `fieldset`/`legend`; combobox for countries; results update politely |
| Funding result | name, funder, type, why it matches, check this, next deadline, last verified | match, check conditions, needs re-check (admin only) | reasons written as text |
| Map + institution panel | map region, clusters, attribution, panel | loading, loaded, panel open, error | map labelled and skippable; panel is a complementary region (desktop) or dialog (mobile); "Institutions in view" list is the keyboard alternative |
| Paper entry | plain title, original title, authors short, venue, date, preprint label, evidence label, summary, why it matters, DOI | preprint, peer reviewed | evidence label as text + icon |
| Evidence label | icon + level text | four levels + mixed | never colour-only |
| Newsletter block | heading, value line, email field, consent checkbox, button | default, error, submitting, success | `type=email`, `autocomplete=email`; errors linked with `aria-describedby` |
| Stats band | four live counts, each a link, with captions | loaded, zero (hidden) | numbers rendered in HTML on the server |
| Breadcrumbs, pagination | links | current page | `nav` with `aria-label`; real links, no infinite scroll |
| Footer | sitemap columns, contact and legal notice | — | landmarks |
| States | skeleton rows (static under reduced motion), empty (actions), error (retry + reference ID), offline banner | — | status messages in live regions |
| Report a problem | link on every item → short form | sent | prefilled item reference |
| Sign-in page | Google, ORCID and "Email me a sign-in link" buttons; one-line privacy note | default, link sent, error | real links and forms; no provider scripts on our pages |
| Save button | bookmark toggle on rows and detail pages | saved, not saved, signed out (opens sign-in) | `aria-pressed`; announces "Saved" |
| Account menu and settings | Saved, Digest settings, Privacy (export, delete), Sign out | — | menu button; deletion confirmed in a dialog |

### 7.6 Review against template defaults

| First instinct | Revised to | Why |
|---|---|---|
| Soft editorial serif for display | Commissioner with the Flair axis | Rooted in the agora story; avoids a look common in generated sites |
| Grid of identical rounded job cards with soft shadows | Dense list rows with a deadline gauge; hairline separators; no shadows | Faster scanning; structure encodes the deadline |
| Big-number stat band with a gradient | Four live counts as links with short captions, flat background | Keeps the requested pattern but makes each number useful |
| Eyebrow labels, middle-dot metadata strings, arrows appended to links, mono labels | None of these; metadata as separate labelled elements | Common template tells |
| Fade-in on scroll for every section | No entrance animations | One orchestrated moment only |

---

## 8. Reference mapping

### 8.1 Julich Brain Atlas (credibility and structure)

| Pattern | Decision | How and why |
|---|---|---|
| One clear primary action in the hero | Adopt | "Find positions" is the only button; "Explore the map" is a text link |
| Hook question and "Google Earth for the brain" zoom story | Adapt | Map section "Where is your next lab?"; zoom world → country → institution → its positions and events |
| Stat counters | Adapt | When fetched, their counter figures were missing from the HTML (filled by JavaScript). Ours are server-rendered live counts, each linking to the filtered list |
| Image cards for main sections | Adapt | Window overview shows live content previews; images only when openly licensed |
| News cards with category tag and date | Adopt | Papers, news and Learn entries |
| Skip link; footer legal notice and privacy | Adopt | Plus the contact page required by Law 5651 |
| Generic link text ("Read article", "Tap to learn more") | Reject | Descriptive link text (WCAG 2.4.4) |
| Partner logo wall, portrait quote | Reject | No institution logos; no testimonials at launch |

### 8.2 Basel Area Life Sciences Supercluster (editorial polish and conversion)

| Pattern | Decision | How and why |
|---|---|---|
| Mega-menu with grouped submenus, search entry, one persistent header CTA | Adopt | CTA "Get the monthly digest" |
| Top-level menu items that are `#` links | Reject | Labels go to real pages; a separate disclosure button opens the panel |
| Full-bleed hero | Adapt | Full-bleed, but content-first; 3D is an enhancement |
| Alternating image/text sections | Adapt | Only on About (2–3 sections) |
| Stats band with short, witty captions | Adapt | Captions are draft copy, e.g., "Each links to the original posting", "Consider this your action potential"; numbers are live |
| Map used as storytelling | Adopt | Live map preview section |
| Story cards with category tags | Adapt | Papers of the month and Learn cards |
| Newsletter block before the footer; sitemap footer | Adopt | Both |
| Eyebrow labels above headings; raw URLs used as link text; stock photos of people | Reject | Template tells and accessibility problems |
| Confident, warm voice with science wordplay | Adapt | Voice rules: plain verbs, sentence case, at most one light pun per page, never in legal, error or medical text |

### 8.3 D2C Life Science (one signature moment)

| Pattern | Decision | How and why |
|---|---|---|
| Restrained two-colour palette | Adopt | Indigo + magenta; DAPI blue is functional (links, focus, map) |
| One memorable 3D hero (self-solving cube that becomes a pill) | Adapt | Astrocyte reaches the six windows, then settles into the logo mark (§10) |
| Content rendered in the browser | Reject | When fetched, their home page HTML held little beyond a tagline and a contact button; all Gliagora content is server-rendered semantic HTML |
| 3D beyond the hero, scroll-jacking | Reject | 3D on the home hero only; native scrolling |

---

## 9. Low-fidelity wireframes

Numbers, names and dates below are placeholders.

### 9.1 Home — desktop

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Skip to main content                                                          │
│ (mark) Gliagora | Neuroscience   Jobs▾ Events▾ Funding Papers News Resources▾ │
│                              [Search  Ctrl K]  [EN▾]  [Get the monthly digest] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                               Jobs          Events            │
│  Where neuroscience meets                         \        /                  │
│                                          Resources ──( cell )── Funding       │
│  Curated positions, events, funding and           /        \                  │
│  papers from every subfield.               News              Papers           │
│                                           (static poster; 3D canvas on top)   │
│  [ Find positions ]    Explore the map                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  412 open positions    57 deadlines this month   238 institutions  41 countries│
│  Each links to the     Consider this your        Every one a node  And counting│
│  original posting      action potential          in the network                │
├───────────────────────────────────────┬──────────────────────────────────────┤
│ Latest positions                      │ Deadlines coming up                   │
│ PhD in cortical circuit dynamics      │ 3 Nov   Abstract: Example Conference  │
│ Example Institute, Germany   12 days  │ 10 Nov  Travel grant: Example School  │
│ (6 rows)             All positions    │ (6 rows)              All deadlines   │
├───────────────────────────────────────┴──────────────────────────────────────┤
│ Where is your next lab?                     [static map preview with clusters] │
│ Zoom from the world to a country, an institution and its open positions.      │
│ Explore the map                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ The six windows: short description + 2–3 live items + link each               │
│ (asymmetric: Jobs wide; Events, Funding; Papers, News, Resources)             │
├──────────────────────────────────────────────────────────────────────────────┤
│ Get the monthly digest: positions, deadlines, papers and funding.             │
│ [email address                    ] [Get the monthly digest]  [ ] consent     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Windows | Learn | About | Legal                     Contact and legal notice   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Home — mobile

```
┌─────────────────────────────┐
│ (mark) Gliagora | Neuro…  ⌕ ☰│
├─────────────────────────────┤
│ Where neuroscience meets    │
│ Curated positions, events,  │
│ funding and papers.         │
│ [      Find positions     ] │
│ Explore the map             │
│ [poster: cell + 6 labelled  │
│  links in a 2×3 layout]     │
├─────────────────────────────┤
│ 412 open    │ 57 deadlines  │
│ positions   │ this month    │
│ 238 institu-│ 41 countries  │
├─────────────────────────────┤
│ Latest positions (4)        │
│ Deadlines coming up (4)     │
│ Where is your next lab?     │
│ Newsletter block            │
│ Footer (stacked link lists) │
└─────────────────────────────┘
```

### 9.3 Jobs list + map — desktop

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Neuroscience positions                                    412 open positions  │
│ [Position type▾][Subfield▾][Method▾][Model system▾][Country▾][Deadline▾][More▾]│
│ PhD ✕  Systems and circuits ✕  Germany ✕   Clear all          Sort: Deadline▾ │
├──────────────────────────────────────────┬───────────────────────────────────┤
│ 38 positions match                       │ ┌───────── map (sticky) ────────┐ │
│ ──────────────────────────────────────── │ │    (12)          (4)          │ │
│ PhD in cortical circuit dynamics         │ │  (37)     ●3                  │ │
│ Example Institute of Neuroscience        │ │        ●1        ●2           │ │
│ Frankfurt am Main, Germany               │ │ © OpenStreetMap contributors  │ │
│ PhD   Closes 14 Nov 2026  ▮▮▮▮▯ 12 days  │ └───────────────────────────────┘ │
│ [Closing soon]                           │ Institutions in view (list)       │
│ [Systems and circuits] [Electrophysiology] [Mouse]                           │
│ [View original posting ↗]   Details      │                                   │
│ ──────────────────────────────────────── │                                   │
│ (next rows)                              │                                   │
│ 1  2  3  …  Next                         │                                   │
└──────────────────────────────────────────┴───────────────────────────────────┘
```

### 9.4 Jobs — mobile

```
┌─────────────────────────────┐
│ Neuroscience positions      │
│ 412 open                    │
│ [Filters (3)]   [Show map]  │
│ PhD ✕  Systems… ✕  DE ✕ (scrolls)
├─────────────────────────────┤
│ PhD in cortical circuit     │
│ dynamics                    │
│ Example Institute, Germany  │
│ PhD   14 Nov   12 days left │
│ [Closing soon]              │
│ [View original posting ↗]   │
├─────────────────────────────┤
│ (next rows)                 │
└─────────────────────────────┘
Filters: bottom sheet, sections as accordions, [Clear all] [Show 38 positions]
Map: full screen; tapping an institution opens a half-height sheet (9.6)
```

### 9.5 Job detail — desktop (mobile: one column, primary action sticky at the bottom)

```
Jobs / PhD / Systems and circuits
PhD in cortical circuit dynamics
Example Institute of Neuroscience      Frankfurt am Main, Germany
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ Deadline   14 Nov 2026           │   │ [ View original posting ↗ ]      │
│            12 days left          │   │ The employer's page is the       │
│ Position   PhD                   │   │ authoritative source.            │
│ Start      Spring 2027 (stated)  │   │ Last verified 24 Sep 2026        │
│ Language   English               │   │ Report a problem                 │
└──────────────────────────────────┘   └──────────────────────────────────┘
Our summary
One or two sentences written by Gliagora.
Topics  [Systems and circuits] [Electrophysiology] [Mouse]
More at this institution (3)           Similar positions (6)
```

### 9.6 Institution panel

```
Desktop: panel over the right side of the map (400px)
┌ Example Institute of Neuroscience ─────────── [Close] ┐
│ Frankfurt am Main, Germany                            │
│ Website ↗     ROR record ↗                            │
│ Open positions (3)                                    │
│   PhD in cortical circuit dynamics                    │
│   Closes 14 Nov 2026, 12 days left                    │
│   Postdoc in dendritic computation                    │
│   Closes 1 Dec 2026                                   │
│ Upcoming events (1)                                   │
│   Example Summer School, 3–7 Jun 2027                 │
│ [ View institution page ]                             │
└───────────────────────────────────────────────────────┘
Mobile: bottom sheet at half height with a drag handle; expands to full; Close button; focus moves to the sheet heading.
```

### 9.7 Events — desktop (mobile: same rows stacked; month view becomes a week list)

```
Neuroscience events                    [List] [Month]     Subscribe to calendar
[Type▾][Format▾][Subfield▾][Country▾][Deadline type▾][Dates▾]
November 2026
┌───────────┬──────────────────────────────────────────────────────────────┐
│ 12–15 Nov │ Example Neuroscience Conference                               │
│ 2026      │ Frankfurt, Germany    Conference    In person                 │
│           │ [Abstract 3 Nov] [Travel grant 10 Nov] [Registration 1 Dec]   │
│           │ [Add to calendar▾]    Official site ↗                         │
└───────────┴──────────────────────────────────────────────────────────────┘
Month view: 7-column grid, event bars across days, deadline markers with text; "Show as list" link.
```

### 9.8 Funding finder — desktop (mobile: questions stacked, sticky "Show 14 programs")

```
Find funding you are eligible for
┌ 1  Where are you in your career? ────────────────────────────────────┐
│ ( ) BSc/MSc student  (•) PhD candidate  ( ) ≤3 years after PhD       │
│ ( ) 3–7 years after PhD  ( ) Independent researcher                  │
├ 2  Citizenship and residence ────────────────────────────────────────┤
│ Citizenship [Türkiye ▾]      Currently living in [Germany ▾]          │
├ 3  Where do you want to work? ───────────────────────────────────────┤
│ [x] Europe  [ ] Northern America  [ ] Asia  [ ] Oceania  [ ] Anywhere │
└──────────────────────────────────────────────────────────────────────┘
14 programs match       5 need a closer look
┌ Example Postdoctoral Fellowship ───────────────────────────────────────┐
│ Example Agency   Individual fellowship                                 │
│ Why it matches: open to all nationalities; host in Europe              │
│ Check: mobility rule on recent residence in the host country           │
│ Next deadline 10 Sep 2027        Last verified 20 Sep 2026             │
│ [Official call ↗]   Details                                            │
└────────────────────────────────────────────────────────────────────────┘
Eligibility is summarised by Gliagora. Always confirm on the official call.
```

### 9.9 Papers of the month — desktop (mobile: tabs scroll horizontally)

```
Papers of the month: October 2026
Curator's note (2–3 sentences)
[All] [Cognitive] [Systems and circuits] [Molecular and cellular] [Glial biology] …
┌──────────────────────────────────────────────────────────────────────────┐
│ How astrocytes may pace a slow brain rhythm            (our plain title)  │
│ Original title: "…"   First Author et al.   Example Journal   2 Oct 2026  │
│ [Preprint – not peer reviewed]   Evidence: Animal (mouse)                 │
│ Our summary, 120–200 words.                                               │
│ Why it matters: one sentence.                                             │
│ DOI ↗    PubMed ↗                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.10 Newsletter signup and confirmation (same layout on mobile, single column)

```
/en/newsletter/
Glia Notes
One email a month: new positions, upcoming deadlines, papers and funding.
Email address [______________________]  [ Get the monthly digest ]
[ ] I agree to receive Glia Notes by email.
    How we handle your email address (privacy policy, KVKK texts)
Read a past issue

/en/newsletter/check-your-inbox/
Check your inbox
We sent a confirmation link to a•••@example.org. It expires in 7 days.
Nothing arrived? Check your spam folder or [Send it again] (after 60 seconds).
Wrong address? Go back.

/en/newsletter/confirmed/
You are subscribed. The next issue arrives on Tuesday 3 November.
[Browse the archive]   [Explore positions]
```

### 9.11 About (single column on mobile)

```
About Gliagora
[logo lockup]
Glia + agora: the name story (two short paragraphs)
Who Gliagora is for
How curation works: 1 Discover  2 Verify on the original page  3 Summarise in our words
                    4 Tag  5 Link to the source  6 Expire automatically
Sources and editorial policy (summary + link)
Who runs Gliagora (name, credentials) + Contact and legal notice
```

### 9.12 Sign in and account (single column on all sizes)

```
/en/sign-in/
Sign in to save positions and manage your digest
[ Continue with Google ]
[ Continue with ORCID  ]
[ Email me a sign-in link ]   (then: check your inbox; link valid 15 minutes)
No passwords. We receive only your email address (Google) or your ORCID iD.

/en/account/
Saved (12)    Digest settings    Privacy
Digest [on]   Preferred subfields  [Glial biology ✕] [Cognitive ✕] [+ Add]
Privacy       [Download my data]   [Delete my account]  (confirmation dialog)
```

---

## 10. Signature hero storyboard

**Concept: a brain that meets you (D18).** On arrival a 3D brain, built from a cloud of points, turns slowly while magenta-to-cyan calcium waves sweep across the cortex. The six windows (Jobs, Events, Funding, Papers, News, Resources) are real HTML links anchored around the brain. On scroll, the camera moves into the cortex to a single astrocyte whose waves resolve into the three arcs of the logo (6b), which the header lockup then carries.

### 10.1 Layers

| Layer | Content | Requirement |
|---|---|---|
| L0 HTML (always) | H1, subline, primary action, six window links, live counts | Server-rendered; complete without JavaScript |
| L1 Static poster | Inline SVG (≤15 KB) of the brain with one calcium wave, coloured by CSS tokens (light/dark) | Default for everyone; stays for ineligible devices |
| L2 WebGL canvas | Three.js scene cross-fading over L1 | Progressive enhancement only |

### 10.2 When the 3D layer loads

All must be true: WebGL2 available; `prefers-reduced-motion: no-preference`; no Save-Data; effective connection not 2g/3g; `deviceMemory` ≥4 where reported; viewport ≥768px, or a phone with `deviceMemory` ≥6. Otherwise the poster gets a one-time CSS stroke-draw of the wave (≤1.2 s).

### 10.3 Frames

| Frame | Trigger | What happens | Notes |
|---|---|---|---|
| F0 | First paint (server HTML) | Poster + text | LCP is the H1 |
| F1 | After `load`, during idle (at most 2 s later) | Hero chunk is imported; scene built in slices; canvas fades in over the poster (300 ms) | If build time >1.5 s or the first 60 frames average <30 fps, stay on the poster |
| F2 | Autoplay once per session, 0–1.6 s | Points gather into the brain; one calcium wave (magenta to cyan) sweeps across the cortex; the six labels fade in at their anchors | The only autonomous motion on the site |
| F3 | Hover or keyboard focus on a label | A wave travels across the brain to that label's anchor (400 ms); the label reveals its live count ("412 open positions"); other labels dim | Keyboard focus triggers the same state; the count is also in the HTML; click is a normal link |
| F4 | Scroll through the hero (0–60% of its height), scrubbed | The camera moves into the cortex; points condense into one astrocyte; its waves become the three arcs of the 6b mark; labels hand over to the stats band | Native scrolling, no scroll-jacking |
| F5 | Hero leaves the viewport | Header mark changes from outline to filled (200 ms); render loop stops; GPU memory released after 10 s off-screen | IntersectionObserver + `visibilitychange` |
| F6 | User scrolls back up | F4 in reverse; no autoplay replay | — |

**Logo target:** a build script samples points along the final `logo-mark.svg` (6b: three arcs and the G bar) into a target-positions JSON; F4 morphs the astrocyte's waves into these positions.

### 10.4 Static fallback and reduced motion

- Static fallback: the L1 poster with the same six links; works without JavaScript, in forced-colours mode and in print.
- Reduced motion: poster only; no autoplay, no scrub, no parallax; hover and focus change only colour and reveal counts.

### 10.5 Performance budget

| Budget | Limit |
|---|---|
| Effect on LCP | None (chunk requested after `load`) |
| Hero JavaScript (three.js tree-shaken + GSAP core + ScrollTrigger + scene) | ≤230 KB gzip, measured in CI `[U]` exact library sizes |
| Downloaded assets | One brain point cloud ≤150 KB (quantised positions, about 20–30k points) derived from an openly licensed (CC0 or CC BY) brain surface model, credited on the About page; the astrocyte stays procedural; one inline 64×64 glow sprite |
| Main thread | No task >50 ms during setup; pointer handling throttled to animation frames |
| GPU | ≤60k triangles, ≤12 draw calls, pixel ratio capped at 1.75 (1.5 on phones), no post-processing passes |
| Frame rate | 60 fps target; quality steps down if frame time >20 ms for 30 frames; poster below 30 fps |
| Layout shift | 0 (fixed aspect-ratio box reserved in the server HTML) |
| Scope | 3D and GSAP load on the home route only |

### 10.6 Technology

Three.js without React Three Fiber (one isolated scene; smaller bundle; direct control of uniforms from timelines) and GSAP with ScrollTrigger. GSAP's licence became free for all use after its 2025 acquisition by Webflow `[U]`; confirm the current terms at M13. The component is mounted with `next/dynamic` (`ssr: false`) behind the eligibility checks.

---

## 11. Stack, hosting and third-party services

### 11.1 Options compared

| Criterion | **A. Next.js + Payload + PostgreSQL (recommended)** | B. Astro + Directus + PostgreSQL | C. Django + Wagtail + PostgreSQL |
|---|---|---|---|
| Popularity, docs, AI maintainability | Very high; one language (TypeScript) | High | Very high |
| Admin and curation dashboard | Generated from the schema in code; custom admin views in React; drafts, versions, access control, localization, scheduled jobs `[U]` details | Strong admin, but a second app to run and upgrade | Excellent admin; custom views in Python templates |
| SSR and SEO | Server Components; static and on-demand revalidation | Best-in-class static output with islands | Server templates |
| Map, filters, 3D hero | Native React; loaded on demand | Islands | Needs a separate JavaScript build |
| Services to run | 1 app + DB | 2 apps + DB | 1 app + DB + JS build |
| Licences | MIT (Next.js, Payload) | MIT (Astro); Directus under a source-available licence `[U]` | BSD |
| Phase 2–3 (accounts, ORCID) | Payload auth with custom strategies | Directus auth | django-allauth |
| Main risk | Next.js caching complexity; Payload owned by Figma since 2025 (still MIT, forkable) `[V]` | Two deploy units | Two front-end toolchains |

**Recommendation: A.** One repository, one deployable app with a built-in admin, one database, one language. Payload is MIT-licensed and self-hosted (its hosted cloud stopped taking new projects after the acquisition `[V]`), which fits the Turkey-only hosting rule anyway.

### 11.2 Architecture

```
             Visitors worldwide ──HTTPS (HTTP/2, HTTP/3)──┐
                                                          ▼
┌──────────────────────── Turkish VPS (data centre in Turkey) ───────────────────────┐
│ Caddy: TLS, compression, security headers, rate limits, IP masking in logs,         │
│        static files incl. map tiles (HTTP range requests)                           │
│   gliagora.com ──► Next.js + Payload (site, admin, API, scheduled jobs)             │
│   lists.gliagora.com ──► listmonk (newsletter; admin UI behind a second password)   │
│   stats.gliagora.com ──► Umami (cookieless analytics; admin only)                   │
│   staging.gliagora.com ──► same images, own databases, basic auth, noindex          │
│ PostgreSQL: app, listmonk, umami databases (not exposed to the internet)            │
│ restic (nightly, encrypted) ──► backup storage at a second location in Turkey       │
└─────────────────────────────────────────────────────────────────────────────────────┘
listmonk ──SMTP/TLS──► Turkish SMTP relay ──► subscribers' mail providers
hello@gliagora.com ──► mailbox at a Turkish mail host (IMAP; no forwarding abroad)
GitHub (code only, no personal data) ── Actions ──► container registry ──SSH──► VPS
```

### 11.3 Components

| Layer | Choice | Licence | Notes |
|---|---|---|---|
| Framework | Next.js (App Router, TypeScript) | MIT | pin major versions; upgrade quarterly via staging |
| CMS, admin, API | Payload 3 inside the Next.js app | MIT | PostgreSQL adapter, Lexical rich text, localization |
| Database | PostgreSQL 16+ with `pg_trgm`, `unaccent` | PostgreSQL | full-text search and duplicate detection without another service |
| Styling | Tailwind CSS v4 driven by the CSS-variable tokens in §7 | MIT | tokens are the source of truth |
| Accessible primitives | Radix UI primitives, cmdk | MIT | unstyled; our visual design |
| i18n | next-intl (ICU messages) + Payload field localization | MIT | §12 |
| Member auth | Auth.js (Google; ORCID via OpenID Connect; email links sent through our SMTP relay); members stored in our PostgreSQL | ISC | separate from Payload admin auth; `[U]` confirm version and maintenance at M4b (Better Auth as fallback) |
| Map | MapLibre GL JS + PMTiles + Protomaps basemap (OpenStreetMap data) | BSD-3 / ODbL data | self-hosted (§14) |
| 3D and animation | Three.js; GSAP + ScrollTrigger (hero only) | MIT; GSAP licence `[U]` | §10 |
| Email templates | React Email | MIT | HTML + plain text from the same data |
| Newsletter | listmonk, unmodified | AGPL-3.0 | runs as a separate service; double opt-in, templates, API `[U]` exact features at M2 |
| Analytics | Umami, self-hosted, cookieless | MIT | also stores Web Vitals as events |
| Spam protection | ALTCHA (self-hosted proof-of-work) + honeypot + rate limits | MIT | no third-party CAPTCHA |
| Proxy and TLS | Caddy | Apache-2.0 | automatic certificates |
| Backups | restic | BSD-2 | encrypted, deduplicated |
| Tests | Vitest, Playwright + axe-core, Lighthouse CI | MIT / Apache-2.0 | §17 |
| Uptime | External free monitor pinging public URLs only | — | no visitor data involved |
| AI (optional) | Claude API, Batch mode | — | §6.6 |

### 11.4 Hosting and KVKK: options and trade-offs

The 2024 amendment to KVKK Article 9 ended explicit consent as the general route for transfers abroad (it survives only for occasional transfers); standard contracts must be signed unmodified and notified to the Authority within 5 business days `[V]`.

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **T. Turkey-only (recommended)** | VPS, SMTP relay, mailbox and backups all from Turkish-registered providers with data centres in Turkey; processor agreement (KVKK Art. 12) with each | No transfer abroad, so no standard contracts, notifications or consent tricks; one simple answer in the privacy policy | Extra latency for distant visitors (roughly 150–300 ms first byte for the Americas and East Asia); fewer email features; basic DDoS protection only |
| S. Foreign providers + standard contracts | Global cloud, ESP and CDN; sign the KVKK processor contract with each and notify within 5 business days | Best global performance and tooling | Large providers rarely sign the Turkish template for individual customers; one public case shows customers failing to obtain it `[V]`; paperwork for every vendor; not realistic for a solo operator |
| H. Hybrid (later, only if needed) | Option T plus a CDN for public pages | Faster globally | A CDN sees every visitor's IP address, so it needs a signed standard contract or a Turkish CDN; only considered if >25% of page views fail LCP at p75 for 2 months |

Practical rules for Option T:

- Prefer Turkish companies over foreign companies renting Istanbul servers; some Turkish sources treat remote access from abroad as a transfer `[U]`.
- The contact mailbox must be Turkish-hosted: the KVKK Board has held that using Gmail for corporate email is a transfer abroad `[V]`. Never auto-forward to a personal Gmail.
- **Current state (2026-09-26):** `hello@gliagora.com` runs on Cloudflare Email Routing, which passes every incoming message through Cloudflare (abroad) to the destination mailbox. Kept as a short interim while traffic is near zero; at M2, before newsletter signups and forms open, MX moves to a Turkish mail host and routing is switched off.
- The domain is registered at Cloudflare Registrar, which requires Cloudflare nameservers. All web records stay **DNS-only** (grey cloud), so no visitor traffic passes through Cloudflare; turning on the proxy (orange cloud) needs a KVKK review first.
- Never paste production personal data into AI tools, issue trackers or chat; staging uses generated fake data.
- Check the data-centre location on the order page: some Turkish companies also sell Europe-located VPS lines `[V]`.
- **Migration trigger (D22):** if the data controller moves abroad, move hosting to the controller's region within four weeks (restore the latest backup on the new server, switch DNS) and update the privacy texts. If Turkish users are a significant audience at that point, get legal advice on VERBİS registration and a representative in Türkiye.

### 11.5 Environments and deployment

| Environment | URL | Data | Access |
|---|---|---|---|
| Local | `localhost` | Generated fake data | Developer |
| Staging | `staging.gliagora.com` | Generated fake data; email only to an allowlist | Basic auth, `noindex`; reachable from a phone for review |
| Production | `gliagora.com` | Real | Public; admin with two factors |

- Push to `main` → CI (lint, type check, unit tests, Playwright + axe, Lighthouse budgets) → image build and smoke test → image pushed to GHCR (tags `main` and `sha-<commit>`).
- Deploys run from the manual **Deploy** workflow (Actions → Deploy → Run workflow, with an image tag) (D27):
  - it runs only on `main` and only when the repository variable `DEPLOY_ENABLED` is `true`; its secrets live in a GitHub environment `production`, limited to `main` and with a required reviewer where the GitHub plan allows it (decided during S);
  - it connects over SSH with a key that can only run `deploy/deploy-remote.sh`;
  - it logs in to GHCR with the job's own short-lived `GITHUB_TOKEN`, so no long-lived registry token is kept on the server;
  - it pulls the image, pins it to its commit (`sha-` tag) and takes a database backup before migrations;
  - it restarts the stack and waits for the health checks.
  Rolling back means deploying the previous `sha-` tag. The workflow is inactive (it skips with a notice) until `DEPLOY_ENABLED` is set.
- Decided during the server setup (S, D23): staging; whether deploys become automatic after merges; automatic rollback when health checks fail; how the deploy secrets are protected (GitHub environment rules need a public repository or a paid plan).
- Infrastructure is described in the repo (`deploy/compose.prod.yml`, `deploy/Caddyfile`, server setup, deploy and backup scripts; runbook in `deploy/README.md`), so a new server can be rebuilt from scratch.

### 11.6 Domain, DNS and email records

| Record | Host | Value (example) | Purpose |
|---|---|---|---|
| A / AAAA | `gliagora.com` | VPS IPv4 / IPv6 (DNS only) | Site |
| CNAME | `www` | `gliagora.com` | Redirect to apex |
| A | `staging`, `lists`, `stats` | VPS IP | Subdomains |
| MX | `gliagora.com` | Now: Cloudflare Email Routing (interim). From M2: Turkish mail host | `hello@`, `privacy@`, `dmarc@` |
| TXT (SPF) | `gliagora.com` | `v=spf1 include:<mailhost> include:<relay> -all` | Authorised senders (stay under 10 DNS lookups) |
| DKIM | `<selector>._domainkey` | Keys from mail host and relay | Signatures aligned with `gliagora.com` |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@gliagora.com` → `p=quarantine` after 4 clean weeks → `p=reject` | Alignment and reports |
| Return-path | `bounce.gliagora.com` | Relay's bounce host, if supported | SPF alignment |
| MTA-STS / TLS-RPT | `_mta-sts`, `_smtp._tls` | Policy + report address | Optional transport security |
| CAA | `gliagora.com` | `0 issue "letsencrypt.org"` | Certificate issuance |
| DNSSEC | — | Enable in the Cloudflare dashboard | Integrity |

Addresses: `hello@` (contact), `digest@` (newsletter sender; Reply-To `hello@`), `privacy@` (data requests), `dmarc@` (reports).

### 11.7 Monthly cost (USD; TL prices converted at signup)

| Item | Launch | 1k subscribers | 10k subscribers | Notes |
|---|---|---|---|---|
| VPS in Turkey (4 vCPU, 8 GB RAM, 80–160 GB NVMe) | $10–40 | $10–40 | $20–60 (8 vCPU, 16 GB) | Istanbul offers seen at roughly $10–40 for 4 vCPU/8 GB `[U]`; choose a Turkish company |
| Backup storage, second location in Turkey | $3–10 | $3–10 | $5–15 | 7 daily, 4 weekly, 6 monthly snapshots |
| Mailbox (1–2 users, Turkish host) | $2–6 | $2–6 | $2–6 | |
| SMTP relay (Turkish) | $0–5 | $1–5 | $5–15 | One Turkish platform lists 500,000 emails for ₺7,500 `[U]` |
| Domain (amortised) | ~$1 | ~$1 | ~$1 | Already registered |
| Claude API (listings + papers) | $3–8 | $3–8 | $5–12 | §6.6 |
| Uptime monitor, GitHub, all open-source software | $0 | $0 | $0 | |
| **Subtotal** | **≈ $19–70** | **≈ $20–70** | **≈ $38–109** | |
| EU GDPR representative | not planned | not planned | not planned | Accepted risk (decision D5, §15.2); plans found at €420–852 per year `[V]` if ever needed |
| EU DSA legal representative | — | — | Phase 3 only, quote needed `[U]` | |

Newsletter volume stays small (10k subscribers × 1 issue ≈ 10,000 emails per month), so sending cost is not a driver; server size is.

### 11.7.1 Lowest-cost setup (D22; prices checked 2026-09-26)

| Item | Choice | Monthly (TL) |
|---|---|---|
| Server | **Bought 2026-09-26:** Hosting Türkiye "Micro Paket" (3 vCPU, 4 GB RAM, 40 GB NVMe, KVM, Istanbul Tier III), monthly term; switch to yearly (−10%) after the first month if stable | 287.88 incl. KDV (239.90 + KDV) |
| Builds | Docker images built in GitHub Actions; the server only pulls and runs them, so 4 GB RAM is enough | 0 |
| Database | One PostgreSQL instance with separate databases for Payload, listmonk and Umami | 0 |
| Backups | Until signups open: nightly encrypted dump on the server plus a weekly copy to the operator's computer in Türkiye. From M2: nightly copy to a second 2 GB VDS at a different Turkish company | 0 → ≈95 `[V]` |
| Mailbox | Cloudflare Email Routing until M2 (§11.4); then one mailbox at a mail provider hosted in Türkiye | 0 → quote at M2 |
| Newsletter sending | No separate relay; listmonk sends through the mailbox's SMTP, throttled to its hourly limit; add a Turkish relay above ~1,000 subscribers | 0 |
| AI drafts | Off at launch; when switched on, a monthly spend limit | 0 (later ≈ $3–8) |
| **Total** | | **≈290 at the start; ≈385 plus the mailbox after M2** |

Order checklist: data centre in Türkiye; renewal price after any campaign period (some discounts apply only to the first three months) `[V]`; KVM virtualisation; NVMe disk; snapshot support; Ubuntu 24.04 LTS image.

---

## 12. Internationalization plan

| Topic | Plan |
|---|---|
| Launch | English UI and content. Turkish legal texts (aydınlatma metni, açık rıza metni, contact page) live at launch. |
| Routing | `/{locale}/` prefix for every public page; locale switcher keeps the path and query string; no automatic redirects. Each locale is a static route folder (`src/app/(frontend)/en`, `tr`), so every unknown public URL gets the server-rendered global 404 page (English); `/admin` and `/api` answer their own 404s. |
| UI strings | All strings in `messages/{locale}.json` (ICU format: plurals, selects, dates); lint rule blocks hard-coded strings in components. |
| Content | Legal texts and About as Markdown files in the repository (`content/{locale}/…`), so git history is their version record; a legal text is published or changed only after the operator has approved that exact text. Payload localized fields for the other evergreen content (Learn, guides, taxonomy labels). Aggregated items keep original title and language with an English summary; they are never machine-translated. |
| `hreflang` | Only between pages with a real, reviewed translation; `x-default` → English; one sitemap per locale. |
| Formatting | `Intl` for dates, numbers, relative time and sorting (`Intl.Collator('tr')`); unambiguous dates ("14 Nov 2026"); time-zone-aware deadlines. |
| Turkish specifics | Locale-aware casing (İ/ı); no CSS `text-transform`; search normalises dotted/dotless i and accents; fonts cover Turkish glyphs. |
| Text expansion | Components designed for +35%; a pseudo-locale in development (longer, accented strings) with screenshot tests at 320px width for header, filters, cards and buttons. |
| Images | No text in images; captions and alt text are strings. |
| Translation workflow | AI draft allowed → review by a native speaker → publish, recording translator, reviewer and date. Never mass-publish; only UI and evergreen pages. |
| Glossary (optional, Phase 2) | Termbase for taxonomy and key terms; used by translators and in AI prompts. |
| Order | EN (launch) → TR (Phase 2 gate) → ES / DE / FR (per-language data gate, §3.4). |
| Writing direction | Left-to-right only for now; logical CSS properties (`margin-inline`, etc.) used anyway. |

---

## 13. Newsletter plan

| Topic | Plan |
|---|---|
| Name | "Glia Notes" (D20); subtitle "the monthly Gliagora newsletter" |
| Cadence | Monthly, first Tuesday, 13:00 UTC (morning in the Americas, afternoon in Europe and Türkiye, evening in East Asia) `[DECISION]` |
| Sections | 1 Opening note (2–3 sentences) → 2 Deadlines in the next 45 days → 3 Selected positions (10–15, balanced by subfield and region) → 4 Papers of the month (5–8, one-line takeaways) → 5 Funding spotlight (1–2) → 6 News in brief (3–5) → 7 From Learn (1) → footer |
| Footer | Why you get this; unsubscribe (one click); manage preferences (Phase 2); contact and legal notice; privacy links; sponsor disclosure (Phase 4) |
| Format | 600px single column; system fonts; dark-mode-safe colours; alt text; plain-text part; HTML under 100 KB (Gmail clips larger messages); direct links to employers without tracking parameters; UTM tags only on links to Gliagora pages; no tracking pixels |
| Tools | Builder in admin (§3.2) renders the issue with React Email → pushes the campaign to listmonk → listmonk sends through the Turkish SMTP relay and handles bounces |
| Signup and consent | Visitors: double opt-in, unticked consent checkbox, consent log (time, text version, source form), unconfirmed addresses purged after 7 days. Members: separate checkbox in settings; the email verified at sign-in counts as confirmation. Minimum age 16 |
| Unsubscribe | `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) headers and a visible link; effective immediately |
| Deliverability | SPF, DKIM and DMARC aligned to `gliagora.com`; custom return-path if the relay supports it; consistent sender; test issue to seed accounts (Gmail, Outlook, Yahoo, a Turkish provider) before each send; Google Postmaster Tools; hard bounces removed at once, soft bounces after 3; complaint rate target <0.1% (large senders to Gmail must stay under 0.3% `[U]`) |
| Archive | `/en/newsletter/{yyyy-mm}/` renders the same data as the email; indexable |
| Metrics (privacy-preserving) | Confirmed subscribers, confirmation rate, unsubscribes per issue, bounces, visits arriving from the newsletter (UTM on our own links) |
| Commercial rules | Kept non-commercial until Phase 4; before the first sponsored issue, register with İYS and treat issues as commercial electronic messages `[U]` (§15.3) |

---

## 14. Map implementation

| Topic | Plan |
|---|---|
| Library | MapLibre GL JS, loaded only when the map is shown |
| Basemap | Protomaps basemap (OpenStreetMap data) as a single PMTiles file on our server, served by Caddy with HTTP range requests; glyphs and sprites self-hosted. The z0–15 planet is about 106 GB and each zoom level roughly doubles the size `[V]`, so a maxzoom-10 extract is estimated at 3–4 GB (measure when extracting); MapLibre over-zooms to street level for context |
| Why not OSM's tiles | The OSMF tile servers are donation-funded, best effort, may block heavy users without notice, and warn commercial or donation-seeking services that access can be withdrawn `[V]` |
| Style | Minimal custom style from the Protomaps flavours, tokenised for light (paper) and dark (night); English labels with fallback; localized labels later |
| Data | `/api/map/institutions?{filters}` returns GeoJSON (institution ID, name, city, country, counts of positions and events) using the shared `FilterState`; cached 10 minutes per filter combination |
| Clustering | GeoJSON source with clustering (radius ~50 px, stops at zoom 12), summed counts; clicking a cluster zooms to its expansion zoom |
| Pins | Circle with count; ring style shows positions, events or both; the panel repeats this in text (never colour alone) |
| Zoom story | World → country (click a country in the list or map to fit its bounds) → institution → panel with its positions and events → detail page |
| Panel | Side panel (desktop) or bottom sheet (mobile); focus moves to its heading; `Esc` closes |
| Sync | Same filters as the list; choosing an institution adds an "Institution" chip; hovering a list row highlights its pin on desktop |
| Accessibility | Map region labelled with a "Skip map" link; never a keyboard trap; "Institutions in view" list as the keyboard and screen-reader alternative; no geolocation prompt; reduced motion jumps instead of flying |
| Attribution | "© OpenStreetMap contributors" (ODbL, links to the copyright page), Protomaps and MapLibre in the attribution control; ROR credited on the map page |
| Events | Pinned at the host institution or at the venue's city; never at an individual's address |
| Fallback | No WebGL → list + static preview image + short message |
| Updates | Basemap refreshed twice a year; institution data monthly with the ROR import |

---

## 15. Legal and compliance

This section is written without legal advice, as requested. Items that cannot be made low-risk by design are flagged with a safer alternative or a deferral (§15.2).

### 15.1 Checklist mapped to features

| Area | Rule | Implementation | Status |
|---|---|---|---|
| Whole site | Law 5651 Art. 3 and the 2007 regulation: identifying information reachable directly from the home page under a "contact" heading (the regulation names commercial or economic content providers) | "Contact and legal notice" page linked in the footer of every page including home: `hello@gliagora.com` at launch; full name (or company name) and postal address added before any revenue, when the site becomes commercial | `[V]` rule (secondary source for the regulation text); `[U]` our reading that a non-commercial site is outside the regulation's list |
| Links | Law 5651 Art. 4(2): a content provider is not responsible for linked third-party content unless it clearly adopts it | Neutral link text; summaries in our words; no endorsement of employers | `[V]` |
| Removal requests | Law 5651 Art. 9: people whose personal rights are affected can ask the content provider to remove content | Takedown form; acknowledgement within 24 hours `[U]` exact current deadline | `[V]` right; `[U]` deadline |
| Jobs | Law 4904: job placement intermediation, including over the internet, needs İŞKUR permission; publishing ads of unlicensed intermediaries is prohibited and fined | Publisher model; employer-origin listings only; no CVs, applications, matching or fees; Terms and About say so in English and Turkish | `[V]` law; `[U]` no İŞKUR guidance found on facts-only aggregators |
| Aggregation | EU database right (Directive 96/9/EC Art. 7; CJEU C-762/19) | Boards used for discovery only; employer links; source register with terms and robots checks | `[V]` |
| All content | Copyright | Own words; no copied descriptions or abstracts; open-licence images with attribution; no logos | — |
| News | EU press publishers' right excludes very short extracts, but headline reuse is contested `[U]` | Write our own headlines | Safer by design |
| Newsletter and forms | KVKK Art. 10 (information notice), Art. 5 (legal bases); explicit consent kept separate from the notice | Turkish aydınlatma metni + separate açık rıza metni; unticked checkbox; double opt-in; consent log | — |
| Transfers abroad | KVKK Art. 9 as amended in 2024 | Turkey-only processors, with two recorded exceptions: Cloudflare Email Routing (interim until M2, while the site is private, so no published text describes it, D32) and the Claude API (redacted text only); any new service is checked first | `[V]` |
| Processors | KVKK Art. 12 (security, processor contracts) | Written processor agreements with VPS, relay, mail host and backup provider; if someone other than the controller runs the technical side, a short controller–processor agreement between them | — |
| Registry | VERBİS | Natural-person controllers under the Board's thresholds are exempt `[U]` current thresholds; recheck yearly | `[U]` |
| Data subject rights | KVKK Arts. 11 and 13 (answer free of charge within 30 days); GDPR Arts. 12–22 (one month) | Form + `privacy@`; tracker with due dates | Well established; wording `[U]` |
| Breaches | KVKK: notify the Board within 72 hours (Board decision) `[U]`; GDPR Art. 33 (72 hours) | Breach runbook with contacts and templates | `[U]` |
| EU visitors | GDPR applies to offering services to people in the EU; a non-EU controller needs an EU representative (Art. 27) unless processing is occasional | See §15.2 flag 1 | Pricing `[V]`; assessment `[U]` |
| Cookies | ePrivacy Art. 5(3) | Only strictly necessary storage (member and admin session cookies; a theme choice in `localStorage` only if a theme switch is ever added: dark mode follows the system, §7.2); cookieless analytics; no banner | — |
| Email | Double opt-in; one-click unsubscribe (RFC 8058) | listmonk configuration + headers | — |
| Accounts | Member data; provider terms (Google OAuth, ORCID Public API) | Server-side redirect sign-in with minimal scopes; providers named in the privacy policy; no personal data sent to providers (data only flows in) | `[U]` KVKK view of social sign-in (own assessment); ORCID Public API free for non-commercial use `[V]` |
| Maps | OSMF tile policy; ODbL attribution | Self-hosted tiles; visible attribution | `[V]` |
| Structured data | Google content policies | No JobPosting; Event only when eligible (§16) | `[V]` |
| AI assistance | EU AI Act transparency duties for AI-generated public-interest text, with an exception for human-reviewed text under editorial responsibility, from 2 Aug 2026 `[U]` | Human approval required; AI-use statement in the sources policy | `[U]` |
| Phase 3 user content | EU DSA: hosting services need points of contact, terms, notice and action, statements of reasons; providers without an EU establishment must appoint an EU legal representative (no size exemption); micro and small enterprises are exempt from some reporting and platform duties | DSA readiness is part of the Phase 3 gate | `[V]` (national regulator and secondary sources) |
| Phase 3 user content | Law 5651: hosting providers keep traffic data for 1–2 years `[U]` | Log retention designed before launch of user content | `[U]` |
| Phase 4 sponsorship | Law 6563 and its regulation: commercial electronic messages need prior consent; İYS | Register before the first sponsored issue | `[V]` scope; `[U]` İYS details |

### 15.2 Flags: not fully low-risk by design

| # | Issue | Why | Safer alternative or deferral |
|---|---|---|---|
| 1 | EU GDPR representative | A monthly newsletter open to EU residents is regular processing, so the "occasional" exemption is unlikely to apply | **Decided 2026-09-26 (D5, updated):** no EU representative; accepted risk at the expected scale (~1,000 members). Revisit only at the first revenue, the Phase 3 gate or any contact from an EU authority (~€420/year upward `[V]`). Main safeguard: instant self-service unsubscribe, export and deletion (§3.2) |
| 2 | İŞKUR classification of job aggregation | No official guidance found | Strict publisher guardrails (§6.1, §15.1); if İŞKUR raises it, pause the jobs window and seek advice |
| 3 | Publishing a home address (Law 5651) | Personal safety and privacy | **Decided (D9):** no address at launch (non-commercial reading `[U]`); before the first revenue, the business address from the tax registration or a virtual office `[U]` |
| 4 | Phase 3 user-generated content | EU representative under the DSA, moderation duties, Turkish hosting-provider log duties | Defer to the Phase 3 gate; start with an institution-level directory from ORCID data and no free-text posts |
| 5 | Phase 4 live talks platform | A hosted video platform account processes attendee data abroad | Public livestream (viewers use the platform directly) + registrations and reminders kept on Gliagora; or self-hosted video conferencing in Turkey `[U]` capacity |
| 6 | AI assistance | Anything sent to the API leaves Türkiye | **Decided 2026-09-26:** listings + papers with redaction, an audit copy of what was sent, and operator approval of every item; residual risk if redaction misses a name |
| 7 | Learn and Bench to Bedside | Medical misinformation risk | Research-translation scope only (D19); evidence labels, references and trial IDs, not-medical-advice note, links to official patient information; clinician review optional and shown only when done |

### 15.3 Revenue, tax and commercial triggers

Before **any** money arrives (sponsorship, ads, donations, paid events): see an accountant and register for tax **first**. The social-content-producer exemption (GVK 20/B) is unlikely to cover a website: the implementing communiqué excludes personal websites, although the scope was widened in 2024, so this needs an accountant's view `[U]`. Also before the first sponsored email: İYS registration; clear "Sponsored" labels on site and in email; update Terms and Privacy.

**Before-any-revenue checklist** (sponsorship, ads, donations, paid events or services):

- See an accountant and register for tax (see above).
- Add the operator's full name (or company name) and postal address to the contact and legal notice page (D9).
- Run the trademark name searches in TÜRKPATENT, EUIPO and WIPO, and decide whether to register the name (D13).
- İYS registration before the first sponsored email; "Sponsored" labels on the site and in email.
- Update the terms of use and the privacy policy; the operator approves the new texts (D28).

### 15.4 Required legal pages and their contents

The texts are Markdown files in `content/{locale}/` (D28). Each stays a draft (visible notice, `noindex`, not in the sitemap) until the operator approves that exact text; open questions are listed in `docs/legal-open-questions.md`.

| Page | Contents |
|---|---|
| Contact and legal notice (`/en/contact/`, `/tr/iletisim/`) | Launch: email `hello@gliagora.com`; what Gliagora is; statement that Gliagora publishes information and is not an employment agency; links to takedown and data requests. Before any revenue: operator's full name (or company name) and postal address |
| Privacy policy (EN) | Controller: Nuray Sancar, `hello@gliagora.com` (identity required by KVKK Art. 10 and GDPR Art. 13; no postal address needed); data processed (member accounts: email, optional display name, ORCID iD, saved items, preferences; sign-in providers Google and ORCID; newsletter email and consent records; suggestion form; data request and takedown correspondence; server logs with masked IPs, 14 days; cookieless analytics); purposes and legal bases (GDPR and KVKK); recipients (named Turkish processors); no transfers abroad; retention table; rights and how to use them; complaints (KVKK Board, EU supervisory authorities); EU representative; minimum age 16; security summary; version history |
| KVKK aydınlatma metni (TR) | Article 10 elements: controller identity (Nuray Sancar), purposes, recipients and reasons, collection method and legal basis, Article 11 rights, how to apply |
| Açık rıza metni (TR) | Separate, specific consent text for the newsletter |
| Cookies and storage | The few strictly necessary items, why, how long; no analytics cookies |
| Terms of use | Service description; information only, no guarantee; always check the original posting; no employment intermediation; acceptable use of forms; licence of our summaries (quote with attribution and link); third-party links; liability limits as permitted; governing law Türkiye without removing mandatory consumer rights elsewhere `[U]`; changes |
| Notice and takedown, corrections | How to report; what to include; timelines (acknowledgement within 24 hours for personal-rights requests `[U]`, decision usually within 72 hours); employer update/removal requests; counter-notice; corrections log |
| Data requests | Self-service for members (export and delete in settings); verification-link flow with automatic deletion for non-members; form with instant acknowledgement for other requests; free; answer within 30 days |
| Accessibility statement | WCAG 2.1 AA target; known issues; how we test; contact; response time |
| Sources and editorial policy | Facts + own summary + link; source categories; automation policy; AI use; corrections; no paid placements; how employers request changes; sponsorship labels (Phase 4) |
| Medical note (Learn) | Not medical advice; evidence levels explained; author credentials and reviewer; last reviewed date; what to do in an emergency |

### 15.5 Verification log (checked 2026-09-26)

| Claim | Status | Source |
|---|---|---|
| KVKK Art. 9 amended by Law 7499; consent-based transfers accepted only until 1 Sep 2024; standard contracts notified within 5 business days; four standard contract types | `[V]` | kvkk.gov.tr (Standart Sözleşmeler; Yurt Dışına Aktarım; bildirim modülü duyurusu); CottGroup; Güneş Partners (May 2026) |
| No adequacy decisions issued as of May 2026 | `[V]` secondary | Güneş Partners (May 2026) |
| Using Gmail for corporate email is a transfer abroad | `[V]` | KVKK Board decision 2019/157 |
| Customers struggle to obtain signed KVKK contracts from a large cloud provider | `[V]` | Microsoft Q&A thread, Dec 2025 |
| Law 4904: internet intermediation needs İŞKUR permission; ads of unlicensed intermediaries must not be published | `[V]` | Consolidated law text (Lexpera); İŞKUR FAQ; fines communiqué (mevzuat.gov.tr) |
| Law 5651 Arts. 3, 4, 9 and regulation Art. 5 (contact heading reachable from home page) | `[V]` law; regulation via secondary source | Law text PDF; university guidance note |
| CJEU C-762/19 (3 Jun 2021) | `[V]` | Judgment summaries (SCL, IPPT) |
| DSA: EU legal representative for non-EU providers; micro/small exemptions | `[V]` secondary | BIPT (Belgian regulator); law-firm briefings |
| GDPR Art. 27 representative prices (e.g., €420–852/year plans) | `[V]` | Prighter pricing page |
| OSMF tile policy | `[V]` | operations.osmfoundation.org/policies/tiles |
| PMTiles planet size and zoom doubling | `[V]` | Protomaps docs and community README |
| Google: JobPosting rejects incomplete descriptions; Event rules (unique URL, publicly bookable, physical location, limited regions) | `[V]` | developers.google.com (Job posting; Event, updated 2026-09-08) |
| OpenAlex API keys and daily allowance (Feb 2026) | `[V]` | developers.openalex.org docs (authentication; deprecations) |
| ROR dump schema v2, CC0; API v1 retired Dec 2025 | `[V]` | Zenodo ROR data v2.5 |
| NCBI E-utilities limits and off-peak rule | `[V]` | NCBI Bookshelf NBK25497 |
| bioRxiv API endpoints and category filter | `[V]` | api.biorxiv.org help; CASRAI guide |
| Claude API prices, Batch discount, tokenizer note | `[V]` | platform.claude.com pricing page |
| Payload: MIT, acquired by Figma in 2025, hosted cloud closed to new projects | `[V]` secondary | 2026 guides (The Frontend Company; FocusReactive) |
| Law 6563 regulation scope (commercial communication) | `[V]` | Regulation text (secondary host) |
| GVK 20/B scope and 2026 cap; personal websites excluded in the communiqué | `[V]` secondary | Muhasebetr articles; 2026 rulings |
| Turkish email and VPS offers (prices, "servers in Turkey") | `[U]` vendor claims | SenderTR, Netlen; is*hosting, Infrawire |
| VERBİS thresholds; KVKK 72-hour breach rule; 5651 24-hour reply; AI Act dates; GSAP licence; listmonk features; Gmail bulk-sender numbers; font coverage | `[U]` | Re-check at the milestone that needs them |

---

## 16. SEO and growth

### 16.1 Technical SEO

- Server-rendered HTML for every page; clean, stable URLs; canonical tags; split XML sitemaps with accurate `lastmod`; `robots.txt` disallows `/admin`, `/api`, search and filter URLs.
- Lifecycle rules from §2.5 (closed jobs `noindex` → `410`); empty institution pages `noindex`.
- Filtered URLs canonicalise to the base list. Indexed landing pages are curated: subfield hubs, and "position type × subfield" pages only when they hold ≥10 open items (avoids thin or mass-generated pages).
- Open Graph images generated on the server from our own fonts and tokens.
- Search Console and Bing Webmaster Tools (DNS verification; no visitor data involved).

### 16.2 Structured data (only where eligible)

| Type | Where | Decision |
|---|---|---|
| `Organization`, `WebSite` | Home, About | Yes |
| `BreadcrumbList` | All deep pages | Yes |
| `Article` (with author) | Learn, Papers of the month, newsletter archive | Yes |
| `ProfilePage` | Author pages | Yes |
| `Event` | Events with a physical venue and registration open to the public | Yes, only then. Google requires a unique page per event, a physical location and public bookability; online-only and invitation or selection-based events are ineligible; the event experience is limited to a few regions and languages `[V]` |
| `JobPosting` | — | **Never.** Google does not allow job postings with incomplete descriptions, and the markup must sit on the page that carries the full description `[V]`; our facts-only pages do not qualify |
| FAQ, Dataset, Course | — | Not used |

### 16.3 Content and trust

- Subfield hubs with a human-written introduction (150–300 words), live items from all windows and links to related hubs.
- Author pages with credentials; editorial policy; references and "last reviewed" dates on Learn.
- Internal links from every item to its subfield hubs, institution page and related items.

### 16.4 Growth loops

| Channel | Tactic |
|---|---|
| Newsletter | The core loop: signup blocks on home and every window; archive pages rank and convert |
| Shareable filters | "PhD positions in computational neuroscience in Germany" as a clean URL with a good preview card |
| LinkedIn (positions) | Weekly post of 5–10 closing-soon positions linking to Gliagora pages |
| Instagram @gliagora (later) | Carousels generated from published items: Papers of the month, Deadlines this month, Bench to Bedside explainers; an admin "Export for social" action renders 1080×1350 cards + caption drafts |
| Communities | Society student chapters, university career services, Neuromatch and similar communities, relevant mailing lists (announce the digest) |
| Measurement | Umami (cookieless) with UTM tags on our own links; Search Console queries; newsletter signups per 100 unique visitors (target 2–4%) |

---

## 17. Accessibility and performance plan

### 17.1 Targets

| Area | Target |
|---|---|
| Accessibility | WCAG 2.1 AA on every public template and the admin views used daily; visible focus everywhere; reflow at 320px; 200% text zoom; forced-colours mode; `prefers-reduced-motion` respected |
| Core Web Vitals (p75, mobile, real users) | LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 |
| Server response | TTFB ≤0.6 s for Türkiye and Europe, ≤1.0 s elsewhere (cached HTML) |
| Lab scores (staging, mobile throttling) | Lighthouse performance ≥90 and accessibility 100 on home, jobs, job detail, events, funding, papers |

### 17.2 How it is tested

| Layer | Method | When |
|---|---|---|
| Static checks | `eslint-plugin-jsx-a11y`; lint rule against hard-coded strings and raw colour values | Every commit |
| Automated a11y | Playwright + axe-core on ~12 templates × light/dark × desktop/mobile; 0 serious or critical issues allowed | Every pull request |
| Keyboard paths | Playwright scripts: skip link, mega-menu, search dialog, filters, bottom sheet, map panel, newsletter form (focus order and focus return) | Every pull request |
| Contrast | `src/app/(frontend)/tokens.test.ts` validates all token pairs in §7.2 | Every pull request |
| Performance lab | Lighthouse CI with budgets (§17.3), against the deployed site | From S on; part of the pre-launch checklist (§20). Byte budgets and font layout shift are checked on every pull request already |
| Manual a11y | Keyboard-only walkthrough; screen readers: Orca (Linux), VoiceOver (iOS/macOS) or TalkBack (Android); zoom and forced-colours checks | On the deployed site, from S on; part of the pre-launch checklist (§20) |
| Real device | Mid-range Android phone on a throttled 4G connection | On the deployed site, from S on; part of the pre-launch checklist (§20) |
| Real-user monitoring | `web-vitals` in the browser → aggregated events in Umami (no personal data) → p75 per template and region | Continuous; weekly review |

### 17.3 Budgets

| Resource | Budget |
|---|---|
| HTML (list pages) | ≤60 KB gzip |
| CSS (total) | ≤35 KB gzip |
| JavaScript on ordinary pages (initial, incl. framework runtime) | ≤140 KB gzip (D29). Measured at M1: 135 KB on every template, of which about 132 KB is React and Next.js themselves; the header's own script is about 3 KB. The map and hero chunks below have their own budgets and load only on their own routes |
| Hero chunk (home only, after `load`) | ≤230 KB gzip |
| Map chunk (on demand) | ≤280 KB gzip `[U]` |
| Fonts | 2 families; ≤4 files preloaded; ≤120 KB total |
| Images | AVIF/WebP, responsive `srcset`, explicit dimensions, lazy below the fold |
| Third-party requests | 0 |

The budgets above for JavaScript, CSS, HTML and fonts (bytes, preloaded files and families) are checked for every template in CI by `tests/e2e/budgets.spec.ts`, measured from what the browser downloads, and the end-to-end tests fail on any request to another domain. Lighthouse CI for the Core Web Vitals lab scores (§17.2) is still to be added.

### 17.4 Techniques

Server Components by default (lists and filters render on the server; only controls are client components); static generation with on-demand revalidation when content is published; optimistic filter chips and `useTransition` to keep INP low while results load; metric-adjusted font fallbacks and reserved aspect ratios for zero layout shift; link prefetch on hover/focus for detail pages; map and hero code only where needed.

---

## 18. Security and privacy by design

### 18.1 Personal data inventory at launch (the only personal data processed)

| Data | Where | Purpose | Retention |
|---|---|---|---|
| Newsletter email + subscription status | listmonk DB (Türkiye) | Send the digest | Until unsubscribe; unconfirmed: 7 days |
| Member account (email, optional display name, ORCID iD, provider account IDs) | App DB (Türkiye) | Sign-in, saved items, preferences | Until deletion; after 24 months inactive: warning, deletion 30 days later |
| Saved items, saved searches, preferences | App DB | Member features | Deleted with the account |
| Sessions and email sign-in tokens | App DB | Keep members signed in | Sessions 30 days; tokens 15 minutes, single use |
| Consent records (UUID, event, text version, time, form) | App DB | Prove consent | Subscription + 3 years `[U]`; unlinked (anonymised) when the person deletes their data |
| Suggestion form email (optional) | App DB | Tell the submitter the outcome | 90 days after decision |
| Data request / takedown correspondence | App DB + mailbox | Handle the request | 2 years after closure `[U]` |
| Server logs (IP masked) | VPS | Security and debugging | 14 days |
| Analytics | Umami DB | Aggregated statistics (no cookies) | Aggregates kept; raw events 12 months |
| Admin accounts | App DB | Access control | While active |

### 18.2 Controls

| Area | Measures |
|---|---|
| Admin access | Payload auth with lockout (5 attempts, 15 minutes); long passphrase in a password manager; second factor (TOTP plugin if mature `[U]`, otherwise Caddy basic auth as a second gate on `/admin`); rate-limited auth routes; `HttpOnly`, `Secure`, `SameSite=Strict` cookies; audit log. listmonk and Umami admin UIs behind basic auth plus their own logins |
| Member accounts | No passwords; OAuth state and PKCE checks; email links single use, 15 minutes, rate-limited; session rotation at sign-in; members cannot reach `/admin` (separate auth and tables) |
| Forms | Server-side validation (zod); ALTCHA; honeypot; rate limits; http/https URL allowlist; length limits; no HTML input; output encoding |
| HTTP headers | Strict CSP with nonces and no third-party origins; HSTS (preload after 3 stable months); `X-Content-Type-Options`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` disabling camera, microphone, geolocation; `frame-ancestors 'none'` |
| Server | Ubuntu LTS; unattended security upgrades; SSH keys only, no root login; firewall (80, 443, restricted SSH); fail2ban; non-root containers; PostgreSQL not exposed; one DB user per app; secrets in `600` env files and GitHub Actions secrets |
| Supply chain | Lockfile; Renovate pull requests weekly, merged after staging; dependency vulnerability scan in CI; container images pinned by digest |
| Backups | Nightly encrypted restic snapshots to a second location in Türkiye (7 daily, 4 weekly, 6 monthly); automated monthly restore test into an isolated container; quarterly full restore drill; recovery point 24 h, recovery time 4 h. Erased subscribers age out of backups within 6 months (stated in the privacy policy) |
| Monitoring | External uptime check (public URLs only); disk, CPU and certificate-expiry alerts by email; backup success/failure emails |
| Incidents | Runbook: contain, assess, decide on notification (KVKK Board and, if appointed, EU representative; 72-hour clocks), document; contact list kept in the repo (no personal data) |
| Privacy defaults | No third-party requests; no tracking pixels; masked IPs; cookieless analytics; only the origin sent as referrer; no geolocation prompts; notices at the point of collection |
| Staging hygiene | Fake data only; email allowlist; `noindex`; basic auth |
| AI and tooling hygiene | No personal data in prompts, issues, commits or screenshots; code-only context for Claude Code |
| Vendor control | `docs/vendors.md` lists every external service, the data it sees and its location; adding a vendor requires a KVKK check first |

---

## 19. Weekly workload estimate (operator)

| Period | Hours/week | What the hours go to | Fits 15 h? |
|---|---|---|---|
| Build to public launch (M0–M6 incl. M4b, about 11–14 weeks) | 10–14 | Review each milestone on staging (phone), decisions, legal text review (4–6 h); seed ≥150 positions and institutions (6–8 h) | Yes |
| Phase 1a live | 5–8 | Jobs queue (3–4), newsletter (~0.75), inbox, requests and member support (1–1.5), maintenance (0.5–1) | Yes |
| Phase 1 complete | 10–13 | Jobs (3–4), events (1–1.5), funding (0.5–1, quarterly peaks), papers (1.5), news (0.5–1), newsletter (1), Learn and resources (1.5–2), operations and inbox (1–1.5) | Yes, tight in Oct–Feb application season |
| Phase 2 | 12–15 | Above + career guide per month, Turkish review, account support | At the limit; use AI drafts and trim news volume |
| Phase 3 | 15–20 | Above + moderation and member support | No: needs a second editor or moderator (gate) |
| Phase 4 | +6–8 in talk months | Speaker coordination, hosting, recording and summary | Needs a helper |

---

## 20. Build roadmap

Milestones run in this order: M0 → M1 → M3 → M4 (built and tested locally while S waits, D38) → **S (one-time server setup)** → one-time lawyer review → M2 → M4b → M5 → M6 → M7 … M14 (D23, D32, D38). The server setup came after M3 so that nothing depends on a live server earlier; M2 (newsletter) follows S and the lawyer review because it needs the mailbox, listmonk and the server, and it is when the first legal texts go live. The whole site stays private until M2 (D32).

Until S, each milestone ends merged to `main` with CI green and its image in GHCR. From S on, each milestone ends deployed to production (and to staging, if S decides to run one).

| # | Milestone | Scope | Deployable outcome | Estimate |
|---|---|---|---|---|
| M0 | Foundations | Repository with `PLAN.md` and `CLAUDE.md`; Next.js + Payload + PostgreSQL in Docker Compose; CI that builds the images and pushes them to GHCR; server files prepared but not run (`deploy/`: setup script, Compose with Caddy, backups, manual deploy workflow) | "Coming soon" page with contact and legal notice, merged to `main` | 1–2 weeks |
| M1 | Design system and shell | Tokens, fonts, header and mega-menu, footer, skip link, dark mode, `/en/` routing, i18n scaffolding, 404/410, legal pages (EN + TR), About with the name story | Shell site with legal pages | 1–2 weeks |
| M3 | Taxonomy and institutions | Taxonomy seed with synonyms; ROR import job; country sets; institution pages; hub skeletons | Admin-complete data layer; hubs `noindex` | 1 week |
| S | Server setup (one-time, after M3 and the local M4 work, D38) | Turkish VDS (4 GB, §11.7.1) hardened with `deploy/setup-server.sh`; DNS; production stack with Caddy; backups and restore test switched on; deploy workflow secrets. Decided during S: staging, automatic rollback on failed health checks, Caddy rate limits, backup alerts, protection of the deploy secrets | Production server running; first deploy through the deploy workflow (what goes public is decided then) | 0.5–1 week |
| M2 | Newsletter | Turkish mailbox and SMTP relay; SPF/DKIM/DMARC; listmonk; double opt-in pages; consent log; KVKK texts; unsubscribe headers; archive template; MX moves from Cloudflare Email Routing to the Turkish mail host before signups open | Signups open before content exists | 1–2 weeks |
| M4 | Jobs | Job collection; review queue v1; "Suggest a listing"; list, filters, chips, URL state; detail; closing soon; auto-expiry; sitemaps; basic search | Jobs window live (soft launch) | 2–3 weeks |
| M4b | Accounts and self-service privacy | Member sign-in (Google, ORCID, email link); saved items; digest settings and subfield preferences; export and delete; inactivity clean-up; automatic acknowledgements for requests | Accounts ready on staging, released with M6 | 1.5–2 weeks |
| M5 | Map | Basemap extract and assets; `/en/map/`; jobs split view; clustering; institution panel; list sync | Map live | 1–2 weeks |
| M6 | Home and public launch | Home with static poster hero, live counts, latest positions and deadlines, windows overview, newsletter blocks; pre-launch checklist below and the §3.4 gate | **Public launch (Phase 1a)** | 1 week + seeding |
| M7 | Curation automation | Source register; allowed monitors; dedupe; link checker; dashboard widgets; local tag suggester; optional AI tier | Faster curation | 1–2 weeks |
| M8 | Events and alerts | Events, deadlines, list and month views, iCal feeds, add to calendar, eligible Event markup; saved searches with weekly job alerts | Events window and alerts live | 2–3 weeks |
| M9 | Funding | Programs, calls, country sets, eligibility finder, last-verified rules and alerts | Funding window live | 2 weeks |
| M10 | Papers and News | PubMed, bioRxiv, OpenAlex ingestion; paper review; monthly issue pages; news list | Papers and News live | 2 weeks |
| M11 | Newsletter builder | Builder view; email template; test sends; archive pages | First full digest | 1 week |
| M12 | Resources and Learn | Resources; articles; Bench to Bedside; evidence labels; author pages; hubs for all windows | All six windows live | 2 weeks |
| M13 | Signature hero | Builds on the 6b logo SVGs in `public/brand/`; §10 in full | 3D hero live | 2 weeks |
| M14 | Hardening | Accessibility audit, performance tuning, security review, restore drill, documentation | Phase 1 complete | 1 week |

**M1 notes (2026-09-27).**
- Legal pages delivered in M1 as drafts: contact and legal notice (EN, TR), privacy policy, KVKK aydınlatma metni, terms of use. The açık rıza metni (newsletter signup), notice and takedown, data requests, and cookies and storage were drafted after M3 (2026-09-27), before the one-time lawyer review between S and M2, so that one review covers them all (C1, D32); the takedown and data-request pages get their forms in M4 and M4b. The accessibility statement and the sources and editorial policy follow before the M6 launch, as part of the "all legal pages live" gate in §3.4.
- The §12 pseudo-locale screenshot tests are added in M4, when filters and cards exist. In M1 the header is checked in Turkish (labels about 50% longer than English), with WCAG 1.4.12 text spacing and at 320px on every template.
- Lighthouse CI, the screen-reader check and the real-phone check (§17.2) run on the deployed site, so they are on the pre-launch checklist below; byte budgets and layout shift while fonts load are already checked in CI.

**M3 notes (2026-09-27).**
- Taxonomy: the 117 terms of §4.2–4.7 are seeded in English with descriptions and synonyms; Turkish labels come with the Turkish site (§12). Synonyms leave out words that would tag unrelated adverts (bare acronyms such as LTD, MS, PI, BIDS; words such as "award", "virtual", "master's"). The tag suggester (M7) matches all-caps synonyms case-sensitively and as whole words, and prefers the longest match within a vocabulary.
- Geography: 250 countries (UN M49 plus XK and TW) and the four country sets, each checked against its official source on 2026-09-27 (§4.6).
- Institutions: the full ROR v2.13 import took about 15 minutes locally (140,078 institutions); later imports change only what ROR changed. The server checks Zenodo every night at 03:30 UTC; the admin shows the state under System → ROR import.
- Institution pages and subfield hubs are built and `noindex`: institution pages become indexable with their first active item (M4), hubs with their written introductions. The proxy resolves record URLs (404 for unknown, 308 to the current URL, 410 for a retired subfield, 503 while the database is unreachable) and keeps those answers out of caches.
- Later milestones pick up: the institution mini map (M5), re-checking the country sets (M9), and the MeSH and OpenAlex mappings of the terms (M10).

**M4 notes (2026-09-27; built locally with fake data, D38).**
- Jobs (M4.1): a deadline is a calendar day plus the time zone of the institution, or of the posting when it names another (the 418 zones of the IANA zone.tab and UTC; left empty only when the zone is unknown, which means Anywhere on Earth, as §2.5 and §3.2 say), and `deadlineAt` is when that day ends there. Payload's own time-zone option for date fields is not used: it stores the day as noon in the chosen zone, so the stored date depends on the zone, and choosing the zone after the day shifts the day shown.
- Review and publication need the facts (position type, at least one subfield, own summary, original posting, deadline, the day it was verified); publication also needs the five checklist boxes (§6.4) and a deadline that has not passed. A job that was published never goes back to draft or review and is never deleted (it is withdrawn instead); only a published job can be expired or withdrawn. Following the §6.3 verification rule, publishing an expired or withdrawn job again, or changing the deadline of a published one, needs a new "Last verified" day (later than the saved one, or today), and closing a published job clears "position still open" and "deadline confirmed", so they are ticked again before it is published again.
- Only signed-in editors delete anything: an `access` function replaces Payload's default user check, so each one checks the user itself (the `/api` routes are public). An institution is kept while a job or an earlier version of a job refers to it.
- The duplicate warning (§6.3) runs when a job enters review or publication, and whenever its title, address, institution or deadline change, including when "Duplicate of" is cleared. Withdrawn jobs and jobs already marked as a duplicate are not compared; "Not a duplicate" is not stored and applies to the save it is ticked on; a job marked as a duplicate cannot be published. The canonical address treats http and https as the same and writes percent-escapes in upper case (a comparison key only; the original address is kept as entered).
- A job's `country` and `city` are copied on save from its location override or its institution, for filters and the map; if a ROR update moves an institution, its jobs follow on their next save.
- `source` waits for the Source register (M7). `pnpm fake:jobs` adds about 60 generated jobs and seven fixed ones for the end-to-end tests; it refuses to run on the production server.
- Job pages (M4.2): a job is closed from the end of its deadline day, even before the hourly check marks it expired, and answers `410` from 30 days after it closed (the end of the deadline day, or the moment it was marked expired if that came first, as for a position filled early); a withdrawn job answers `410` at once. The closed page shows the notice and the similar open positions first and no way to apply; it is `noindex`. The deadline shows its time zone ("until the end of that day, Central European Time (UTC+1)") only when the posting's zone is known: Anywhere on Earth is our safe assumption for keeping a listing open, not the employer's deadline, so it is not presented as one. Days left count from the moment, not the reader's calendar; under 24 hours the text says "Last day". Dates are formatted in British English ("14 Nov 2026"; September is "Sept"). On narrow screens at least 20rem (320px) tall the primary action is fixed at the bottom; the page keeps room for it, also when enlarged text wraps its label, and focused elements scroll clear of it (WCAG 2.4.11). On shorter screens (such as 400% zoom) and in print it stays in the page. Titles in another language get `lang`, and right-to-left ones (Arabic, Hebrew, Persian) `dir="rtl"`. A retired subfield stays on its jobs as plain text, without a link to its hub (which answers `410`), and is not used for the breadcrumb. In lists, "View original posting" is an outlined button, so one accent button leads each page; links to employers have no `rel` (editorial, unpaid links; the default referrer policy sends only our origin). Breadcrumbs (Jobs › position type › first subfield › title; on institution pages Home › institution) also give the `BreadcrumbList` data on every page that has breadcrumbs. Redirects from an outdated slug are not cached, for jobs and institutions alike (a title or name changed and changed back would otherwise loop). Institution pages list up to 10 open positions and are indexed while they have one; hubs list up to 10 and stay `noindex` until their introductions. "All N positions" links to the filtered list appear only when more exist than are shown. The job page adds no JavaScript (the same scripts as every page).
- Review queue (M4.4, admin only): a suggested position becomes a candidate at once, in the same transaction, and the suggestion follows its candidate: in the queue until the candidate is decided, then decided, with the day its email address, link and note are deleted (90 days later, D34); reopening the candidate puts it back in the queue and clears that day. Suggestions of events, funding, papers, news, resources and other things get no candidate until their windows are built (M8–M12), so "creates a Submission and a Candidate" (§3.2) holds for positions only for now: they wait as New and editors handle them by hand and set them to Decided. An email address given without ticking the consent box is dropped before anything is stored, and the email address and note are never list columns (the list loads only its columns, so they are not sent to it either). Suggestions are created only through the local API (the form, M4.5), never through the API or the admin; editors delete one to answer a data request, which leaves its candidate and job without the link.
- A candidate starts as New, or Triaged when an editor adds it by hand with the facts. Accepting needs the address, the title as posted and the institution, is refused when a job with the same canonical address exists (the editor marks it as a duplicate of that job instead), and makes a draft job, linked from the candidate under "Job created" (`publishedRef`; a job's candidate is found by filtering candidates by `publishedRef`) and, when the candidate came from a suggestion, linked to that suggestion (`Job.submission`); the editor completes and publishes it: nothing is published from the queue. Accepting is done one candidate at a time (a bulk edit to Accepted is refused, since bulk saves run in parallel and would miss each other's jobs), and a draft made from a candidate, or marked as the job a candidate repeats, is kept (it can be edited, not deleted). Accepted is final; a rejected candidate (with a §6.1 reason; "other" needs a note) or a duplicate (of a job) can be reopened as Triaged, then decided again. The possible duplicates are found on every save: jobs with the same canonical address, jobs not closed yet at the same institution with a title at least 0.8 similar (the deadline is not compared, since a candidate has none), and other candidates with the same address unless rejected. Candidates are never deleted: they are the record of every decision (20 versions each). The admin dashboard shows what waits (new and triaged candidates, jobs in review, suggestions not decided) and the deadline tracker: published jobs closing within 14 days, the next 10 listed in the order of their deadline days. `pnpm fake:jobs` also adds seven suggestions and nine candidates covering every state. Waiting for later steps: the form (M4.5); deleting the source text 30 days after the decision, from the candidate and from all its saved versions (`_candidates_v.version_snippet`; also the AI audit copy from M7, D34): clearing the field alone leaves the text in earlier versions, which editors can read and restore, and Payload has no admin or API route to delete a version, so the purge clears the version rows as well (for example `UPDATE _candidates_v SET version_snippet = NULL WHERE parent_id = …`, or `payload.db.updateVersion`, in the same transaction); deleting the suggestion's personal data 90 days after the decision; and the outcome emails (`notifiedAt`) (M4.7); `source`, `aiSuggestion` and candidates from source monitors (M7).
- Jobs list (M4.3): the shared filter model is in `src/lib/filters/` (a generic part plus the jobs configuration, reused by events, funding, the map and saved searches), with the canonical form of §2.4. The proxy redirects other spellings (`308`, cached for a day; syntax only, no database), keeping `utm_*` tags after the filters so newsletter and social visits are counted. It compares queries as a form encodes them, because Next.js hands the proxy the query re-encoded (commas as `%2C`): a different spelling of the same characters is not redirected, which also rules out a redirect to itself. Values that name nothing (an unknown or retired term, a country or institution that does not exist) stay in the address, match nothing and get no chip; the chips' links and the form leave them out, so the next change drops them. Country and region are one location filter: a job in Germany or in Asia; a region stands for its countries. Deadline filters leave out rolling and until-filled positions: `7d`…`90d` close within that many days from now (`14d` is the "Closing soon" badge), `this-month` in the current calendar month (UTC), a range on its days, both included (bounded by the last moment of its last day, so it may end on 9999-12-31); the form's "Between these dates" sends both days, which the redirect turns into `YYYY-MM-DD..YYYY-MM-DD`. Days that make no range (one missing, or the first after the second) are not applied: with JavaScript, Apply shows an error tied to the date fields and moves focus there; without it, the address is not redirected and the page shows the days entered with the same error (`noindex`), the other filters applied (WCAG 3.3.1). Free text is at most 100 characters and needs every word in the title, summary or institution name until full-text search (M4.9). The list is one plain GET form, so it works without JavaScript; from 1280px (the header's desktop breakpoint) its filters are a bar of popovers, below it a "Filters (3)" sheet with the same controls as accordions, which JavaScript turns into a modal dialog over an inert page (a sheet opened before JavaScript ran stays in the page until it is closed, so nothing jumps when it starts; should the dialog leave the page while open, the page is released). Inside the dialog, a status region of its own announces the new count, since the page behind it is inert. Chips are links to the list without their value, so they work without JavaScript and can be opened in a new tab; the empty state's "Remove the last filter" removes the last value with a chip in the address, since the canonical address does not record the order in which filters were added; when values that name nothing are set, it offers "Remove the filters that no longer exist" instead, which drops only those. With JavaScript each change applies at once without a page load (arrow keys in the deadline options only move the choice, since they check every option they pass; Enter or Apply applies it), focus stays where it was and the new count is announced. The count and the sort order stay in place above the results, and the chips and rows are new for each address rather than moved, so a change that arrives late shifts nothing (measured with the answer held for 700 ms: at most 0.001, against 0.46 before); the results are at least a screen tall, so the footer does not rise into view. A page past the end counts its matches separately, since Payload's Postgres adapter reports none for an empty page when the query joins another table. There is no `loading.tsx`: Next.js would stream it first, and without JavaScript the page would stay a skeleton; the page arrives complete instead, and while a change loads the rows show placeholder bars in place (after 300 ms, nothing moves). When the list cannot be read, the page draws the error on the server, with the reference of the server log and a "Try again" link, so it shows without JavaScript; Next.js cannot set a page's status, so it answers `200`, not stored and `noindex`. `error.tsx` draws the same state only for failures while a change loads in the browser. No offline banner: with JavaScript a failed change falls back to a normal page load, where the browser explains that it is offline. Measured on the list: 139.4 KB of JavaScript (gzip; the list's own code 3.8 KB, and the header script about 0.7 KB more on every page for the sheet and for following the address) and 21 KB of HTML.
- The server loads Payload from `node_modules` instead of bundling it (`serverExternalPackages` in `next.config.ts`, as Payload already does in development): the production build had copied Payload into each part of the server, and refused saves then reached the admin without the message at each field. An end-to-end test signs in as a test editor (`e2e-editor@example.org`, added by `pnpm e2e:editor` in CI and locally, never on the production server) and checks those messages.

- Suggest a listing (M4.5): `/en/suggest/` (indexed, listed in the sitemap) and `/en/suggest/sent/` (`noindex`; reaching it directly changes nothing). The form asks for the address of the original page, the content type (radio buttons, none chosen in advance, so an event is not sent as a position by mistake), an optional note and an optional email address with an unticked box "Email me the outcome of this suggestion"; the hint next to the box says what the privacy texts say (only for the outcome, deleted 90 days after the decision, 16 or older) and links to the privacy policy and the KVKK notice, and does not call it "açık rıza" while B8 is open. An email address without the ticked box, or the box without an address, is an error the person corrects; nothing is dropped silently. Every check runs on the server (zod, `src/lib/forms/`) and every message comes from `messages/*.json`, so the form works the same without JavaScript (a Server Action with `useActionState`; without JavaScript the browser posts the form and the page comes back with the messages); only the spam check needs JavaScript, which a `<noscript>` note says, with `hello@gliagora.com` as the alternative. The address must be http or https, of a named host, without a user name or password, at most 2,000 characters (also in the canonical form); internationalised domain names are fine. It is stored as typed, so it may not contain what the URL parser would silently drop or change (spaces, tabs, backslashes, control and text-reordering characters); the collections refuse these too (`isHttpUrl`). The note is plain text, at most 500 characters, without control or text-reordering characters. After an error, the summary at the top (links to the fields) takes focus, the fields keep what was typed and carry `aria-invalid` and their message; the note's count is in the server's HTML (so nothing moves when the scripts arrive), updated as the person types and read out only within 50 characters of the limit. After a suggestion is taken, the Server Action calls `refresh()` before leading to the sent page, so Back shows the form with a new challenge rather than the router's cached copy with the one just used.
- Spam protection (M4.5): ALTCHA's first proof-of-work scheme (`altcha-lib/v1`, MIT, no network calls): each page gets a signed challenge (HMAC-SHA256 with `ALTCHA_HMAC_KEY`, valid 21 hours: over the 20 hours after which WCAG 2.2.1 sees no time limit, under the 24 hours used answers are kept; a secret number up to 50,000), and a small solver of our own (about 2 KB with the form; the ALTCHA widget would not fit the 140 KB budget and adds interface we do not need) finds it with `crypto.subtle` in batches of 500 when the form is first used, giving the browser a turn after each batch (`scheduler.yield()`, or a timer where it does not exist), since Chromium settles the hashes without one and the search would otherwise block input and painting: about 0.3 s on average on a desktop and 1.1 s with the processor slowed down four times, with no task over about 70 ms (an end-to-end test checks this). A form sent before the scripts have run is answered that the page had not finished loading or JavaScript is off. The server checks the answer, and each answer sends one suggestion. Without `ALTCHA_HMAC_KEY` the page says the form is temporarily unavailable and the rest of the site works (the production Compose file requires it). The hidden field (`reference_code`, a name browsers do not fill in automatically) answers as if it worked and stores nothing. The checks run cheapest first: the fields, the hidden field, the spam check, then the rate limit (5 suggestions per hour per address), so mistakes in the form and failed spam checks count against nobody. The limit and the used answers are rows in the hidden `form-limits` collection (no admin, no API), decided in one PostgreSQL transaction with an advisory lock per key, so parallel requests cannot exceed it: the address is stored only as an HMAC-SHA256 with a key derived from `PAYLOAD_SECRET` (IPv6 by its /64 network), read from the first `X-Forwarded-For` entry that Caddy sets (for IPv6 visitors only because the production Compose network has IPv6 enabled: otherwise Docker forwards them from its bridge gateway and they would share one limit; `deploy/README.md` step 5 checks it before any `AAAA` record is published); rows are deleted within 24 hours (D34): whenever a suggestion passes the spam check (whatever the limit decides), and by the hourly purge (M4.7). They never go into backups: `deploy/backup/backup.sh` dumps the table without its rows (`--exclude-table-data`), so a restore starts with empty limits. A database error shows "Something went wrong" with a reference, and the log records only the reference, the error's class and the database code (read from the error's causes, since Drizzle wraps the driver's error; never a message, which quotes the values sent). `/en/suggest/` loads 137 KB of JavaScript. Waiting for M4.7: the outcome emails, the 90-day deletion and the hourly purge of `form-limits` (in the same run as the auto-expiry; it deletes rows older than 23 hours, so none outlives 24 hours between runs, which is safe because the limit needs one hour of rows and a challenge is valid 21 hours; until then rows older than 24 hours go only when the form is next sent past the spam check). B8 (the KVKK basis for the optional email) stays open.

**Pre-launch checklist** (after S, before the M6 public launch; M6 works through it together with the §3.4 gate):

- Lighthouse CI with the §17.3 budgets running against the deployed site (staging if S sets one up, otherwise production), Core Web Vitals "good" in lab tests.
- Screen-reader walkthrough of every template on the deployed site: Orca (Linux), VoiceOver (iOS or macOS) and TalkBack (Android), plus keyboard-only, zoom and forced-colours checks (§17.2).
- Real-device check on a mid-range Android phone over throttled 4G (§17.2).
- Legal texts: the one-time lawyer review of the questions in `docs/legal-open-questions.md` (group b) happens between S and M2 (D32); the operator then approves each text (D28). The contact pages, privacy policy, KVKK aydınlatma metni and açık rıza metni go live at M2; all other required legal pages are live before M6 (§3.4).
- axe: 0 serious or critical issues; SPF, DKIM and DMARC pass; backup restore drill passed (§3.4).

Phase 1 total: about 23–32 weeks (including S). If M0 starts in early October 2026, the public launch (M6) lands around the turn of the year (late December to early January), still inside the PhD application season.

**Conventions to be written into `CLAUDE.md` at M0 (preview)**

- Conversation in Turkish; code, UI text and documentation in English.
- TypeScript strict; ESLint + Prettier; no `any`; small, typed modules.
- Server Components by default; `"use client"` only for interactive parts.
- UI strings only through next-intl messages; colours, spacing and type only through design tokens.
- Semantic HTML first; every interactive element keyboard-reachable; axe tests for every new template.
- Never add third-party scripts, fonts, embeds or services without a `docs/vendors.md` entry and a KVKK check; never log or paste personal data.
- Content rules: facts + own summary + link; no copied text; employer-origin listings only.
- Payload migrations only; backup before migrating; every milestone deploys to staging first.
- Definition of done: tests green, budgets met, a11y checks pass, docs updated, deployed to staging and reviewed on a phone.

---

## 21. Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | A new tool quietly sends personal data abroad (KVKK) | Medium / High | Vendor register with a KVKK check; CSP blocks third-party origins; review at each milestone |
| 2 | Turkish SMTP relay has weaker deliverability than global providers | Medium / Medium | Full authentication and alignment; test sends; Postmaster Tools; a second Turkish relay evaluated as fallback |
| 3 | Latency for distant visitors from a server in Türkiye | Medium / Medium | Small server-rendered pages, caching, HTTP/3; real-user monitoring; Option H decision gate (§11.4) |
| 4 | Single-server failure | Low / High | Nightly off-site backups in Türkiye; tested restore; rebuild script; uptime alerts |
| 5 | Database-right or copyright complaint from a board or publisher | Low / Medium | No scraping; employer links; own words; takedown process; source register with evidence |
| 6 | İŞKUR treats aggregation as intermediation | Low / High | Strict publisher guardrails; employer-origin only; clear statements; pause the jobs window if contacted |
| 7 | Stale, expired or broken listings erode trust | High / Medium | Auto-expiry, weekly link checks, "last verified" dates, report-a-problem links |
| 8 | Curation burnout for a solo operator | High / High | Capped weekly volume; batch days; local tag suggestions and optional AI drafts; recruit a volunteer editor before Phase 3 |
| 9 | Bus factor (only one person knows the system) | Medium / High | `CLAUDE.md`, runbooks, infrastructure in the repo, password manager with emergency access |
| 10 | Framework churn (Next.js, Payload under new ownership) | Medium / Medium | Pinned versions; quarterly upgrades via staging; MIT licence allows forking |
| 11 | 3D hero or map hurts performance or accessibility | Medium / Medium | Progressive enhancement, eligibility checks, budgets enforced in CI, static fallbacks |
| 12 | Legal texts written without a lawyer contain gaps | Medium / Medium | Conservative design; flagged items (§15.2); review at every phase gate |
| 13 | Spam through the suggestion form | High / Low | Proof-of-work, honeypot, rate limits; nothing auto-publishes |
| 14 | Medical misinformation in Learn | Low / High | Evidence labels, references, disclaimers, reviewer, corrections log |
| 15 | Name or trademark conflict with "Gliagora" | Low / Medium | Search TÜRKPATENT, EUIPO and WIPO before investing in brand assets `[DECISION]` |
| 16 | Image licence mistakes | Medium / Low | Required licence and attribution fields in the media library; no logos |
| 17 | AI draft introduces errors | Medium / Medium | Human approval required; AI sees only source text; facts fields always checked against the original |
| 18 | EU representative and DSA costs arrive before revenue | Medium / Low | Budgeted at gates; Phase 3 scope kept minimal |

---

## 22. Assumptions and open questions

### 22.1 Assumptions (used throughout this plan)

1. The operator is a natural person resident in Türkiye, with no company and no revenue at launch.
2. A monthly budget of roughly $20–70 is acceptable at launch (plus the EU representative if chosen).
3. English only at launch, with Turkish legal texts from day one.
4. No user-generated content is published in Phase 1; suggestions become editorial content after review.
5. Resolved: the final 6b logo SVG files are in `public/brand/` (M0); M13 builds the hero on them.
6. The operator reviews each milestone on staging from a phone and approves production releases.
7. Minimum age for the newsletter is 16.
8. Turkish-registered hosting, mail and relay providers meeting the requirements in §11.4 are available at the listed price ranges `[U]`.

### 22.2 Open questions (remaining, ordered by when they are needed)

| # | Question | Needed by | Default if unanswered |
|---|---|---|---|
| 1 | Resolved: hosting in Türkiye on the lowest-cost setup (D22, §11.7.1); Cloudflare Workers rejected for now because of the KVKK transfer rules | — | — |
| 2 | Resolved: tagline "Where neuroscience meets" (D11) | — | — |
| 3 | Resolved: logo 6b "Calcium wave with astrocyte" (D12); the SVG files are in `public/brand/` (M0), with a dark version of the small mark added in M1 | — | — |
| 4 | Resolved: no trademark filing for now; the M1 web search found no other use of "Gliagora" (nearest: unrelated names such as "Gligora" and "Liagora"). The TÜRKPATENT, EUIPO and WIPO searches are on the before-any-revenue checklist (§15.3, D13) | — | — |
| 5 | Resolved: the operator reserves the @gliagora handles; the footer shows plain links (D14) | — | — |
| 6 | Resolved: "Nuray Sancar, MSc in Neuroscience" (D15); Bench to Bedside written as research translation without a clinician (D19) | — | — |
| 7 | Resolved: "Glia Notes", first Tuesday of each month, 13:00 UTC (D16, D20) | — | — |
| 8 | Launch target. Scan of 26 Sep 2026: ≈200 unique open neuroscience positions on five boards, ≈120–140 of them closing within 30 days, in ≥23 countries (SfN NeuroJobs and EURAXESS not counted) | M6 | Keep ≥150 verified positions across ≥25 countries |
| 9 | Resolved: "Glia Talks" (D21) | — | — |
| 10 | Resolved: no second editor for now (D17); revisit at the Phase 3 gate | — | — |

### 22.3 Decisions recorded (2026-09-26)

| # | Decision | Where it changed the plan |
|---|---|---|
| D1 | Domain registered at Cloudflare Registrar; DNS stays on Cloudflare with web records DNS-only | §11.4, §11.6 |
| D2 | Contact address `hello@gliagora.com`; Cloudflare Email Routing as an interim until M2, then a Turkish mail host | §1 (decision 1), §11.4, §11.6, §15.1, §15.4, §20 |
| D3 | AI assistance for listings and papers; the operator approves every item; redaction before sending | §6.6, §11.7, §15.1, §15.2 |
| D4 | Papers of the month: openly licensed papers only (CC BY, CC BY-SA, CC0); paywalled papers only as manual exceptions (summary + DOI) | §3.2, §6.2 |
| D5 | No EU GDPR representative; accepted risk. Revisit only at the first revenue, the Phase 3 gate or contact from an EU authority (updated in round 2) | §11.7, §15.2 |
| D6 | Turkey-only hosting (Option T) kept; latency accepted | §11.4 |
| D7 | Member accounts at launch: passwordless sign-in with Google, ORCID and email link; saved items and digest preferences in 1a, saved searches with alerts in 1b | §2, §3, §5.1, §7.5, §9.12, §11.3, §13, §15, §18–§20 |
| D8 | Self-service privacy: instant unsubscribe, export and deletion with automatic confirmations; instant acknowledgement for other requests | §3.2, §15.4, §18.1 |
| D9 | Contact page shows only email addresses at launch (`hello@gliagora.com`, and `privacy@gliagora.com` for data requests, §11.6); the operator's name appears as data controller in the privacy texts; name and address go on the contact page before any revenue | §15.1, §15.2, §15.4 |
| D10 | Data controller in the privacy texts: Nuray Sancar (natural person). She agrees to be named, has access to `hello@` and answers requests; services that process personal data are opened in her name, or a short written agreement covers whoever runs the technical side | §15.1, §15.4 |
| D11 | Tagline: "Where neuroscience meets". Logo exploration continues on the design canvas (20 concepts so far) | §1, §22.2 |
| D12 | Logo: concept 6b "Calcium wave with astrocyte" (calcium waves spread from an astrocyte and form a G). Variants: primary, dark, one colour, stacked; simplified marks for 32/24 px and a favicon for 16 px | §7, §22.2 |
| D13 | No trademark registration for now. Name-collision search: the web search at M1 (2026-09-27, no other use of the name found) is enough for now; the TÜRKPATENT, EUIPO and WIPO searches move to the before-any-revenue checklist (§15.3) | §15.3, §22.2 |
| D14 | Social profiles @gliagora on Instagram and LinkedIn, reserved by the operator; the site links to them as plain links (no embedded feeds, no tracking scripts) | §2 (footer), §18 |
| D15 | About page credential: "Nuray Sancar, MSc in Neuroscience" | §2 (About), §22.2 |
| D16 | Newsletter cadence: monthly, first Tuesday at 13:00 UTC; the name is still open | §13, §22.2 |
| D17 | No second editor for now; revisit at the Phase 3 gate | §19, §22.2 |
| D18 | Home hero: a 3D brain with calcium waves; on scroll it zooms into one astrocyte whose waves resolve into logo 6b | §10 |
| D19 | Bench to Bedside is research translation, not clinical guidance: written by a non-clinician author with visible credentials; no diagnosis, treatment or dosing advice; generic drug names, neutral tone; every claim tied to a paper or trial-registry entry with an evidence level; not-medical-advice note and links to official patient information; a "Clinically reviewed" badge only when a clinician has reviewed the item | §3, §15, §21 |
| D20 | Newsletter name: "Glia Notes" (subtitle "the monthly Gliagora newsletter") | §1, §9, §13 |
| D21 | Phase 4 live talk series name: "Glia Talks" (shown as "Glia Talks by Gliagora") | §3 |
| D22 | Hosting stays in Türkiye (Option T) on the lowest-cost setup in §11.7.1: one 4 GB VDS, images built in CI, one shared PostgreSQL, no separate SMTP relay or paid backup service at the start. Everything stays portable in Docker Compose; if the data controller moves abroad, hosting moves to the controller's region. Provider: Hosting Türkiye, Micro Paket, bought 2026-09-26 | §11.4, §11.7.1, §20 |
| D23 | Roadmap: the one-time server setup (S) moves to just before M4, followed by M2 (newsletter). Staging, automatic rollback, Caddy rate limits and backup alerts are decided during S. No work on the server until the operator starts S (decided 2026-09-26) | §20, CLAUDE.md |
| D24 | Favicon: a simpler 16 px design (bold G and a dot, `public/brand/favicon.svg`); the small mark stays for 24–32 px | §7 |
| D25 | Success green darkened to `#1E754A` so it passes AA on every surface; ₺ and ə in body text come from the system fallback font (accepted) | §7.2, §7.3 |
| D26 | ESLint stays on version 9 until `eslint-config-next` supports ESLint 10 | — |
| D27 | Deploys: a manual GitHub Actions workflow (on `main`, switched on by the variable `DEPLOY_ENABLED`) connects over SSH with a key restricted to `deploy-remote.sh` and logs in to GHCR with the job's own short-lived `GITHUB_TOKEN`; no long-lived token on the server. Written now, inactive until the server exists | §11.5, `deploy/README.md` |
| D28 | Approved after M1 (2026-09-27): legal texts and the About page are Markdown files in the repository (`content/`), not Payload fields. Git history records each version (useful for the consent-text version, §3.2), and the pages are static and need no database. A text goes live only after the operator approves that exact wording: until then it shows a "draft" notice and is not indexed, and any later change to an approved legal text needs the operator's approval again before it is merged (CLAUDE.md, rule c) | §12, §15.4 |
| D29 | JavaScript budget: at most 140 KB gzip per ordinary page (M1 measured 135 KB, about 132 KB of it React and Next.js). The map (M5) and the 3D hero (M13) keep their own budgets (§17.3) and load only on their own routes | §17.3 |
| D30 | `gliagora-mark-small-dark.svg` (the small mark in the dark-mode colours) approved for the header in dark mode | §7 |
| D31 | The Instagram and LinkedIn links stay hidden until the operator sends the exact profile addresses; addresses are never guessed | §2.3, D14 |
| D32 | Approved after M3 (2026-09-27, C1): the whole site stays private until M2. Order: S, then the one-time lawyer review, then M2, where `hello@` moves to the Turkish mailbox and the contact pages, the privacy policy, the KVKK aydınlatma metni and the açık rıza metni go live together with the newsletter signup; the terms and the other legal pages go live by M6. The remaining legal texts (açık rıza metni, notice and takedown, data requests, cookies and storage) are drafted before the review, so that one review covers them all. Until M2, `hello@` keeps its current forwarding, and no text describes it | §11.6, §15.4, §20 |
| D33 | C2: besides the controller, a technical administrator has access to the server, the admin panel and the databases. The technical administrator is a data processor (KVKK m.12, GDPR Art. 28) under a one-page written agreement (draft: `docs/legal/veri-isleme-sozlesmesi-taslak.md`, reviewed with the texts); the privacy texts describe the role without naming the person | §15.1, §18 |
| D34 | C3: retention periods not set elsewhere: hashed IP addresses for the suggestion-form limit 24 hours (app database only); bounce records deleted with the address; suggestion link and note deleted with the email, 90 days after the decision; ordinary email to `hello@` 2 years after the last message; admin audit log 1 year; container and application logs 14 days; mailing-list messages in the project mailbox 30 days; listings that went offline: the full record for 12 months, then only the address and ID (so the page keeps answering 410); AI audit copy (once AI drafting is on) 30 days after the decision | §6, §18 |
| D35 | C4: at launch, a member's preferred subfields only set the default subfield filter on the jobs list while signed in; Glia Notes is the same issue for everyone until Phase 2, and no profile is built | §3.2, §13, M4b |
| D36 | C5: important changes to the privacy texts or the terms (a new purpose, a new recipient, a transfer abroad or new duties for members) are emailed to members, shown as a dated notice on the page 30 days before they apply and mentioned in the next Glia Notes; smaller edits only get a new date | §13, §15.4 |
| D37 | Country sets approved as entered in M3 (Horizon Europe without Pillar-II-only countries, EMBC without associate members, Türkiye in Western Asia as in UN M49). For each funding call, eligibility follows the call's own text; the country sets are only defaults | §4.6, M9 |
| D38 | S is postponed by about two days; no work on the server until the operator says so. M4 starts now and is built and tested locally with fake data only; content entry waits for the server. Parts that need production (scheduled jobs, emails) are built and tested locally but not deployed | §20 |

---

*End of plan. On approval, M0 starts: the repository is created, this file is saved as `PLAN.md`, and the conventions above are written into `CLAUDE.md`.*
