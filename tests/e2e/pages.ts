import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'

// Public templates covered by the end-to-end tests. Add every new page template here (PLAN §17.2).
// `member` signs the page in as a test member first (tests/e2e/member.ts, `pnpm e2e:member`).
export const PAGES = [
  { path: '/en/', name: 'home' },
  { path: '/en/contact/', name: 'contact (en)' },
  { path: '/tr/iletisim/', name: 'contact (tr)' },
  { path: '/en/about/', name: 'about' },
  { path: '/en/legal/privacy/', name: 'privacy policy' },
  { path: '/tr/legal/kvkk-aydinlatma-metni/', name: 'KVKK notice (tr)' },
  { path: '/tr/legal/acik-riza-metni/', name: 'consent text (tr)' },
  { path: '/en/legal/cookies/', name: 'cookies and storage' },
  { path: '/en/legal/terms/', name: 'terms of use' },
  { path: '/en/legal/takedown/', name: 'notice and takedown' },
  { path: '/en/legal/data-requests/', name: 'data requests' },
  { path: '/en/events/', name: 'placeholder (window)' },
  { path: '/en/suggest/', name: 'suggest a listing' },
  { path: '/en/suggest/sent/', name: 'suggestion sent' },
  { path: '/en/report/', name: 'report a problem' },
  // From an institution page (D40): only the kinds that fit. The ROR test data, as below.
  { path: '/en/report/?item=institution:05dxps055', name: 'report a problem (institution)' },
  { path: '/en/report/sent/', name: 'report sent' },
  { path: '/en/learn/bench-to-bedside/', name: 'placeholder (section)' },
  { path: '/en/subfields/', name: 'subfield index' },
  { path: '/en/subfields/glia/', name: 'subfield hub' },
  // From the ROR test data that CI loads (pnpm ror:import tests/fixtures/ror/…-sample.zip).
  { path: '/en/institutions/california-institute-of-technology-05dxps055/', name: 'institution' },
  // From the fake jobs (pnpm fake:jobs, src/scripts/fake-jobs-fixed.ts). The jobs list keeps the
  // saving of D45 (budgets.spec.ts): `scriptKb` is its own JavaScript budget.
  { path: '/en/jobs/', name: 'jobs list', scriptKb: 137 },
  {
    path: '/en/jobs/?subfield=glia&type=phd,postdoc&deadline=90d',
    name: 'jobs list (filtered)',
    scriptKb: 137,
  },
  { path: '/en/jobs/?type=phd&q=no+such+position', name: 'jobs list (empty)', scriptKb: 137 },
  { path: '/en/jobs/?view=map', name: 'jobs list (map)', map: true },
  { path: jobPath(FIXED_JOBS.open), name: 'job (open)' },
  { path: jobPath(FIXED_JOBS.expiredRecently), name: 'job (closed)' },
  // Saved positions (M4b): the rows' Save buttons as a member, who has saved three of the fixed
  // jobs (pnpm e2e:member): open, closed recently and withdrawn. The jobs list keeps its budget.
  { path: '/en/jobs/', name: 'jobs list (member)', member: 'email', scriptKb: 137 },
  { path: jobPath(FIXED_JOBS.open), name: 'job (open, member)', member: 'email' },
  { path: '/en/account/saved/', name: 'saved positions', member: 'email' },
  { path: '/en/account/saved/', name: 'saved positions (signed out)' },
  {
    path: `/en/sign-in/?next=%2Fen%2Fjobs%2F&save=job%3A${FIXED_JOBS.open.shortId}`,
    name: 'sign in to save',
  },
  // The world map (M5): MapLibre and its data load after the page; `map` gives it the map budget.
  { path: '/en/map/', name: 'map', map: true },
  { path: '/en/search/', name: 'search (empty)' },
  // Positions, institutions and subfields on the CI data; "See all" too (more than 10 positions).
  { path: '/en/search/?q=neuro', name: 'search (results)' },
  // A pasted address: one long word must wrap, not widen the page (WCAG 1.4.10).
  {
    path: `/en/search/?q=${encodeURIComponent('https://www.example-university.edu/careers/postdoctoral-position-neuroscience-2026')}`,
    name: 'search (long query)',
  },
  { path: '/en/search/?q=zzqxv', name: 'search (no results)' },
  // Member sign-in (M4b). The sign-in form shows where the app can send email (SMTP_HOST, as in
  // CI); without it, the page says that signing in is not available yet. The pages a valid link
  // opens, and the confirm page with a pending Google or ORCID identity, are checked in their
  // flows (sign-in.spec.ts, oidc.spec.ts; at 320px in layout.spec.ts); an unknown token, or no
  // sealed sign-in cookie, shows the expired state.
  { path: '/en/sign-in/', name: 'sign in' },
  { path: '/en/sign-in/sent/', name: 'sign-in link sent' },
  { path: '/en/sign-in/link/?token=expired', name: 'sign-in link (expired)' },
  { path: '/en/sign-in/confirm/', name: 'create your account (expired)' },
  { path: '/en/sign-in/signed-out/', name: 'signed out' },
  { path: '/en/account/', name: 'account (signed out)' },
  { path: '/en/account/', name: 'account (email member)', member: 'email' },
  { path: '/en/account/', name: 'account (ORCID member)', member: 'orcid' },
  { path: '/en/sign-in/', name: 'sign in (signed in)', member: 'email' },
  {
    path: '/en/sign-in/?error=link-expired',
    name: 'sign in (signed in, expired link)',
    member: 'email',
  },
  { path: '/this-page-does-not-exist/', name: '404', status: 404 },
  { path: '/en/gone-example/', name: '410', status: 410 },
] as const
