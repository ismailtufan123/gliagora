import { FIXED_JOBS, jobPath } from '../../src/scripts/fake-jobs-fixed'

// Public templates covered by the end-to-end tests. Add every new page template here (PLAN §17.2).
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
  // From the fake jobs (pnpm fake:jobs, src/scripts/fake-jobs-fixed.ts).
  { path: '/en/jobs/', name: 'jobs list' },
  { path: '/en/jobs/?subfield=glia&type=phd,postdoc&deadline=90d', name: 'jobs list (filtered)' },
  { path: '/en/jobs/?type=phd&q=no+such+position', name: 'jobs list (empty)' },
  { path: jobPath(FIXED_JOBS.open), name: 'job (open)' },
  { path: jobPath(FIXED_JOBS.expiredRecently), name: 'job (closed)' },
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
  { path: '/this-page-does-not-exist/', name: '404', status: 404 },
  { path: '/en/gone-example/', name: '410', status: 410 },
] as const
