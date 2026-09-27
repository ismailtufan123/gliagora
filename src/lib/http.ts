/**
 * Sent with every request the server makes to other sites (Zenodo, the ROR API). It names the
 * site so the source can tell who is asking; some sources, such as Zenodo, refuse requests
 * without one. No personal data.
 */
export const USER_AGENT = 'Gliagora/1.0 (+https://gliagora.com/en/about/)'
