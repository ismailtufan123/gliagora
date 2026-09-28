import messages from '../../../messages/en.json'

// Answers of the machine-readable files (PLAN §2.2): the sitemaps and the jobs feed.

/**
 * Crawlers and feed readers may keep a file for an hour. A job that closes in the meantime stays
 * listed until then; its page already says `noindex`.
 */
export const MACHINE_FILE_CACHE = 'public, max-age=3600'

/**
 * An XML file with its media type. `X-Robots-Tag: noindex` keeps the file itself out of search
 * results; search engines still read the sitemaps and follow their URLs.
 */
export function xmlResponse(body: string, type = 'application/xml'): Response {
  return new Response(body, {
    headers: {
      'Content-Type': `${type}; charset=utf-8`,
      'Cache-Control': MACHINE_FILE_CACHE,
      'X-Robots-Tag': 'noindex',
    },
  })
}

/**
 * A sitemap file that does not exist now (`jobs-3.xml`, `pages-tr.xml`, a type with no pages).
 * Not stored: the file may exist later. Other names under /sitemaps/ get the 404 page from the
 * proxy (src/proxy.ts).
 */
export function notFoundResponse(): Response {
  return new Response(messages.notFound.title, {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
