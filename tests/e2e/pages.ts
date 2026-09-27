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
  { path: '/en/jobs/', name: 'placeholder (window)' },
  { path: '/en/learn/bench-to-bedside/', name: 'placeholder (section)' },
  { path: '/en/subfields/', name: 'subfield index' },
  { path: '/en/subfields/glia/', name: 'subfield hub' },
  // From the ROR test data that CI loads (pnpm ror:import tests/fixtures/ror/…-sample.zip).
  { path: '/en/institutions/california-institute-of-technology-05dxps055/', name: 'institution' },
  { path: '/this-page-does-not-exist/', name: '404', status: 404 },
  { path: '/en/gone-example/', name: '410', status: 410 },
] as const
