// Public templates covered by the end-to-end tests. Add every new page template here (PLAN §17.2).
export const PAGES = [
  { path: '/en/', name: 'home' },
  { path: '/en/contact/', name: 'contact (en)' },
  { path: '/tr/iletisim/', name: 'contact (tr)' },
  { path: '/en/about/', name: 'about' },
  { path: '/en/legal/privacy/', name: 'privacy notice' },
  { path: '/tr/legal/kvkk-aydinlatma-metni/', name: 'KVKK notice (tr)' },
  { path: '/en/legal/terms/', name: 'terms of use' },
  { path: '/en/jobs/', name: 'placeholder (window)' },
  { path: '/en/learn/bench-to-bedside/', name: 'placeholder (section)' },
  { path: '/this-page-does-not-exist/', name: '404', status: 404 },
  { path: '/en/gone-example/', name: '410', status: 410 },
] as const
