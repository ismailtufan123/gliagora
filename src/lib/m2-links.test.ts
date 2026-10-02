import { describe, expect, it } from 'vitest'

import { CONTENT_PAGES, type ContentKey } from './content'
import { DATA_REQUEST_PATHS } from './data-requests/paths'
import { DATA_REQUEST_LEGAL_LINKS } from './forms/data-request'
import { linkInStage, m2Links, m2SignupLink } from './m2-links'
import { renderContentFile, renderMarkdown } from './markdown'
import { NEWSLETTER_LEGAL_LINKS, NEWSLETTER_PATHS } from './newsletter/paths'
import { type IsDraft, isPublicAddress, publicPages } from './public-pages'

// The links of the M2 versions of the content pages (D41, D50): only to public pages, with email
// in place of the suggest and report forms.

const NOW: IsDraft = (key) => CONTENT_PAGES[key].draft
const ALL_APPROVED: IsDraft = () => false
const ONLY_ABOUT: IsDraft = (key) => key !== 'about'
/** Only About and the texts named approved. */
const approved =
  (...keys: ContentKey[]): IsDraft =>
  (key) =>
    key !== 'about' && !keys.includes(key)

/** Every href in a piece of HTML. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!)

/** Whether a link on a public M2 page is allowed: public, within the page, email or elsewhere. */
function allowedOnM2(href: string, draft: IsDraft): boolean {
  if (href.startsWith('#') || href.startsWith('mailto:')) return true
  if (href.startsWith('/') && !href.startsWith('//')) return isPublicAddress(href, draft)
  if (!/^https:\/\//.test(href)) return false
  // Another site; this site's own pages only by their paths (src/lib/markdown.ts).
  const { hostname } = new URL(href)
  return hostname !== 'gliagora.com' && !hostname.endsWith('.gliagora.com')
}

describe('m2Links', () => {
  it('sends the suggest and report forms to email, with or without a query or fragment', () => {
    const link = m2Links(ALL_APPROVED)
    for (const href of [
      '/en/suggest/',
      '/en/report/',
      '/en/report/?item=job:test1',
      '/en/suggest/#form',
    ]) {
      expect(link(href), href).toBe('mailto:hello@gliagora.com')
    }
  })

  it('keeps links to public pages, and the text alone of links to the others', () => {
    const link = m2Links(ONLY_ABOUT)
    expect(link('/en/about/')).toBe('/en/about/')
    expect(link('/en/')).toBe('/en/')
    // Glia Notes opens with the açık rıza metni (src/lib/public-pages.ts).
    expect(m2Links(approved('acikRiza'))('/en/newsletter/')).toBe('/en/newsletter/')
    for (const href of [
      '/en/newsletter/',
      '/en/contact/',
      '/en/legal/privacy/#data-requests',
      '/en/jobs/',
      '/en/map/',
    ]) {
      expect(link(href), href).toBeNull()
    }
    expect(m2Links(ALL_APPROVED)('/en/legal/privacy/#data-requests')).toBe(
      '/en/legal/privacy/#data-requests',
    )
  })

  it('cannot be given a link to this site by its full address (the renderer refuses it)', () => {
    expect(allowedOnM2('https://gliagora.com/en/jobs/', ALL_APPROVED)).toBe(false)
    expect(allowedOnM2('https://www.gliagora.com/en/about/', ALL_APPROVED)).toBe(false)
    expect(allowedOnM2('http://example.org/', ALL_APPROVED)).toBe(false)
    expect(allowedOnM2('https://ror.org/', ALL_APPROVED)).toBe(true)
    expect(() =>
      renderMarkdown('[positions](https://gliagora.com/en/jobs/)', {
        link: m2Links(ONLY_ABOUT),
        sitePathsOnly: true,
      }),
    ).toThrow(/full address/)
  })

  it('leaves links elsewhere and within the page as they are', () => {
    const link = m2Links(ONLY_ABOUT)
    for (const href of ['#rights', 'https://ror.org/', 'mailto:privacy@gliagora.com']) {
      expect(link(href), href).toBe(href)
    }
  })

  it('renders a link that leads nowhere public as its words, keeping their markup', () => {
    const html = renderMarkdown(
      'See the [**privacy** policy](/en/legal/privacy/), [About](/en/about/) and [the form](/en/report/).',
      { link: m2Links(ONLY_ABOUT) },
    )
    expect(html).toBe(
      '<p>See the <strong>privacy</strong> policy, <a href="/en/about/">About</a> and <a href="mailto:hello@gliagora.com">the form</a>.</p>\n',
    )
  })

  it('still refuses unsafe links, whatever the mapper says', () => {
    expect(() => renderMarkdown('[x](javascript:alert(1))', { link: m2Links() })).toThrow(/Unsafe/)
    expect(() => renderMarkdown('[x](/en/about/)', { link: () => 'javascript:alert(1)' })).toThrow(
      /Unsafe/,
    )
  })
})

describe('the M2 versions of the content pages', () => {
  // Today's approvals, the start of M2 (only About), and every text approved.
  for (const [name, draft] of [
    ['now', NOW],
    ['only About approved', ONLY_ABOUT],
    ['every text approved', ALL_APPROVED],
  ] as const) {
    it(`link only to public pages, within the page, to https: pages or to email (${name})`, () => {
      const pages = publicPages(draft)
      const texts = (Object.keys(CONTENT_PAGES) as ContentKey[]).filter((key) =>
        pages.some((page) => page.path === CONTENT_PAGES[key].path),
      )
      expect(texts).toContain('about')
      for (const key of texts) {
        const html = renderContentFile(CONTENT_PAGES[key].file, { link: m2Links(draft) })
        for (const href of hrefs(html)) {
          expect(allowedOnM2(href, draft), `${key}: ${href}`).toBe(true)
        }
      }
    })
  }

  it('write to email where a text links to the suggest or report form', () => {
    const contact = renderContentFile(CONTENT_PAGES.contact.file, { link: m2Links(ALL_APPROVED) })
    expect(contact).not.toMatch(/href="\/en\/(?:suggest|report)\//)
    expect(contact).toContain('href="mailto:hello@gliagora.com"')
  })
})

describe('linkInStage: the links of the data-request pages’ own components', () => {
  it('keep the privacy policy’s words alone while it is not public, and its links once it is', () => {
    const links = [DATA_REQUEST_LEGAL_LINKS.privacy, DATA_REQUEST_LEGAL_LINKS.spamProtection]
    for (const href of links) {
      // The data-request page can be public before the privacy policy is (D41: each on its own).
      expect(linkInStage(href, 'm2', approved('dataRequests')), href).toBeNull()
      expect(linkInStage(href, 'm2', approved('dataRequests', 'privacy')), href).toBe(href)
      // The full site, behind the password, links everything.
      expect(linkInStage(href, 'private', approved('dataRequests')), href).toBe(href)
      expect(linkInStage(href), href).toBe(href)
    }
  })

  it('lead only to public pages wherever the page holding them is public', () => {
    // The data-request page and the pages after it link to these (DataRequestSection,
    // AfterRequest.tsx, the sent and confirm pages; the positions only outside the M2 state).
    const fixed = [
      ...Object.values(DATA_REQUEST_LEGAL_LINKS),
      DATA_REQUEST_PATHS.page,
      DATA_REQUEST_PATHS.form,
      '/en/',
    ]
    for (const draft of [
      approved('dataRequests'),
      approved('dataRequests', 'privacy'),
      ALL_APPROVED,
    ]) {
      expect(publicPages(draft).some((page) => page.path === DATA_REQUEST_PATHS.page)).toBe(true)
      for (const href of fixed) {
        const to = linkInStage(href, 'm2', draft)
        if (to !== null) expect(allowedOnM2(to, draft), href).toBe(true)
      }
    }
  })
})

describe('the Glia Notes links of the M2 state', () => {
  it('offer the signup (header, phone menu, coming-soon page) only while it is public', () => {
    // It records consent to the açık rıza metni, so it opens with that text (D50).
    expect(m2SignupLink(ONLY_ABOUT)).toBeNull()
    expect(m2SignupLink(approved('privacy', 'kvkk'))).toBeNull()
    expect(m2SignupLink(approved('acikRiza'))).toBe(NEWSLETTER_PATHS.signup)
    expect(m2SignupLink(ALL_APPROVED)).toBe(NEWSLETTER_PATHS.signup)
    // Today's approvals.
    expect(m2SignupLink(NOW)).toBe(CONTENT_PAGES.acikRiza.draft ? null : NEWSLETTER_PATHS.signup)
    expect(m2SignupLink()).toBe(m2SignupLink(NOW))
  })

  it('keep the words alone of the form’s links to texts that are not public', () => {
    // The signup can be public before the privacy policy and the KVKK notice are (each on its own).
    const draft = approved('acikRiza')
    expect(linkInStage(NEWSLETTER_LEGAL_LINKS.consent, 'm2', draft)).toBe(
      NEWSLETTER_LEGAL_LINKS.consent,
    )
    for (const href of [
      NEWSLETTER_LEGAL_LINKS.privacy,
      NEWSLETTER_LEGAL_LINKS.kvkk,
      NEWSLETTER_LEGAL_LINKS.spamProtection,
    ]) {
      expect(linkInStage(href, 'm2', draft), href).toBeNull()
      expect(linkInStage(href, 'm2', approved('acikRiza', 'privacy', 'kvkk')), href).toBe(href)
      expect(linkInStage(href, 'private', draft), href).toBe(href)
    }
  })

  it('lead only to public pages wherever the page holding them is public', () => {
    // The signup and the pages after it link to these (NewsletterSignup, the pages under
    // src/app/(frontend)/en/newsletter/), and to email.
    const fixed = [
      ...Object.values(NEWSLETTER_LEGAL_LINKS),
      ...Object.values(NEWSLETTER_PATHS),
      '/en/',
      '/en/about/',
    ]
    for (const draft of [
      approved('acikRiza'),
      approved('acikRiza', 'privacy'),
      approved('acikRiza', 'kvkk'),
      ALL_APPROVED,
    ]) {
      for (const path of Object.values(NEWSLETTER_PATHS)) {
        expect(isPublicAddress(path, draft), path).toBe(true)
      }
      for (const href of fixed) {
        const to = linkInStage(href, 'm2', draft)
        if (to !== null) expect(allowedOnM2(to, draft), href).toBe(true)
      }
    }
  })
})
