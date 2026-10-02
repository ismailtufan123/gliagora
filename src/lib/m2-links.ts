import type { LinkMapper } from '@/lib/markdown'
import { type IsDraft, isPublicAddress } from '@/lib/public-pages'
import { REPORT_PATH } from '@/lib/reports/item'
import type { SiteStage } from '@/lib/site-stage'
import { CONTACT_EMAIL, paths } from '@/lib/site'

// Where a link in a text from content/ leads in the M2 state (D41, D50): its public pages link
// only to public pages, so a visitor never meets the site-wide password.
// - The suggest and report forms stay private until the launch (D39): until then their links
//   write to hello@gliagora.com instead (D41 (1)).
// - Any other page of this site that is not public (a legal text that is not approved yet, a
//   window) keeps its words without the link.
// - Links elsewhere (`https:`, `mailto:`) and within the page (`#…`) stay as they are.

/** The forms that email replaces until the launch. */
export const M2_EMAIL_FORMS: readonly string[] = [paths.section('suggest'), REPORT_PATH]

/** The link mapper of the M2 versions of the content pages (ContentPage, `stage="m2"`). */
export function m2Links(draft?: IsDraft): LinkMapper {
  return (href) => {
    // A path on this site; anything else is checked as it is (SAFE_LINK, src/lib/markdown.ts).
    if (!href.startsWith('/') || href.startsWith('//')) return href
    const path = href.replace(/[?#].*$/, '')
    if (M2_EMAIL_FORMS.includes(path)) return `mailto:${CONTACT_EMAIL}`
    return isPublicAddress(path, draft) ? href : null
  }
}

/**
 * Where a component's own link (not one from content/) leads in a stage: as it is in the private
 * stage; in the M2 versions by the same rules as the texts' links, so null for its words alone
 * (the data-request form's links to the privacy policy, while that text is a draft).
 */
export const linkInStage = (href: string, stage: SiteStage = 'private', draft?: IsDraft) =>
  stage === 'm2' ? m2Links(draft)(href) : href

/**
 * The Glia Notes signup, where the M2 state's own pages offer it (the reduced header's button and
 * phone menu, the coming-soon page): its address while it is public, which it is only with the açık
 * rıza metni (src/lib/public-pages.ts), else null, and the button is left out: a public page never
 * links to one behind the password.
 */
export function m2SignupLink(draft?: IsDraft): string | null {
  const signup = paths.section('newsletter')
  return isPublicAddress(signup, draft) ? signup : null
}
