import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Icon } from '@/components/Icon'
import { textDirection } from '@/lib/jobs/languages'
import { MEMBER_PATHS } from '@/lib/members/paths'
import type { SaveContext, SaveJob } from '@/lib/members/save-context'
import { SAVE_INPUTS, SAVE_NOTE_ID, SAVE_STATUS_ID, signInToSave } from '@/lib/members/saved'

// The Save control of a position (M4b, D49; the M4b design §3, PLAN §7.5), drawn on the server
// from the page's Save context (src/lib/members/save-context.ts): nothing while no way of signing
// in is on; for visitors who are signed out, a link to sign in that saves the position afterwards;
// for members, a form that posts the state they want to /en/account/saved/toggle/ and works
// without JavaScript. With JavaScript, the submit is taken over by a few lines that every page
// carries (DisclosureEnhancer), which load the rest (save-toggle.ts) on first use: the button
// changes in place and the page's live region says "Saved: …"; focus stays on the button.
//
// The button is a toggle (aria-pressed): it reads "Save", and once saved "Saved" (D54), with a
// filled style and another icon (a bookmark with a tick), so the state rests neither on colour
// alone nor on the word, and also shows in forced colours. Its name starts with the visible word
// and adds the position's title for screen readers (WCAG 2.5.3), in the title's own language. The texts the script announces come from the
// messages, in data attributes, so the script holds no text; it gives the title in them the
// language of the button's own title.

/** The `lang` of a position's title: its posting's language, left out for English (the page's). */
const titleLanguage = (job: SaveJob) =>
  job.originalLanguage !== 'en' ? job.originalLanguage : undefined

export async function SaveControl({
  job,
  context,
  id,
}: {
  job: SaveJob
  context: SaveContext
  /** The job page's control has an ID of its own (`save`), which its redirects name. */
  id?: string
}) {
  const t = await getTranslations({ locale: 'en', namespace: 'save' })
  const saved = context.signedIn && context.saved.has(job.id)
  const lang = titleLanguage(job)
  const words = (key: 'label' | 'savedLabel') =>
    t.rich(key, {
      hidden: (chunks: ReactNode) => <span className="sr-only">{chunks}</span>,
      job: (chunks: ReactNode) => (
        <span lang={lang} dir={textDirection(lang)}>
          {chunks}
        </span>
      ),
      title: job.title,
    })
  const label = words('label')

  if (!context.signedIn) {
    return (
      <a
        id={id}
        href={signInToSave(context.next, { type: 'job', shortId: job.shortId })}
        rel="nofollow"
        aria-describedby={SAVE_NOTE_ID}
        className="button button-secondary save-button"
      >
        <Icon name="bookmark" size={18} className="flex-none" />
        {label}
      </a>
    )
  }

  return (
    <form id={id} method="post" action={MEMBER_PATHS.savedToggle} data-save className="save-form">
      <input type="hidden" name={SAVE_INPUTS.item} value={`job:${job.shortId}`} />
      {/* The state the member wants: sending it twice changes nothing. */}
      <input type="hidden" name={SAVE_INPUTS.saved} value={saved ? '0' : '1'} />
      <input type="hidden" name={SAVE_INPUTS.back} value={context.back} />
      <button
        type="submit"
        aria-pressed={saved}
        data-saved-text={t('savedStatus', { title: job.title })}
        data-removed-text={t('removedStatus', { title: job.title })}
        className="button button-secondary save-button"
      >
        <Icon name="bookmark" size={18} className="save-icon-off flex-none" />
        <Icon name="bookmarkCheck" size={18} className="save-icon-on flex-none" />
        {/* Both words are here; the button's state shows one (global.css), so the script that
            changes the state in place needs no text of its own. */}
        <span className="save-label-off">{label}</span>
        <span className="save-label-on">{words('savedLabel')}</span>
      </button>
    </form>
  )
}

/**
 * Once on a page with Save controls: for members, the live region the script writes "Saved: …"
 * into (empty until then); for visitors who are signed out, the note the Save links point to
 * ("You need to sign in to save positions"). The note is `hidden`, not only visually hidden: it is
 * read as each Save link's description (`aria-describedby` reads hidden elements too) and never on
 * its own, which on the jobs list would be before the page's heading.
 */
export async function SaveRegion({ context }: { context: SaveContext | null }) {
  if (!context) return null
  if (context.signedIn) return <p id={SAVE_STATUS_ID} role="status" className="sr-only" />
  const t = await getTranslations({ locale: 'en', namespace: 'save' })
  return (
    <p id={SAVE_NOTE_ID} hidden>
      {t('signInNote')}
    </p>
  )
}

/**
 * The line that names the position signing in will save ("After you sign in, we save this
 * position for you: …"), on every page that leads to saving it: the sign-in page, "Create your
 * Gliagora account" and the page an emailed sign-in link opens. For a member who is signed in and
 * opened a Save link (`signedIn`), the line above that position's Save button instead. The title
 * is in bold, in its own language and direction (WCAG 3.1.2).
 */
export async function SaveNotice({ job, signedIn = false }: { job: SaveJob; signedIn?: boolean }) {
  const t = await getTranslations({ locale: 'en', namespace: 'signIn' })
  const lang = titleLanguage(job)
  return (
    <p>
      {t.rich(signedIn ? 'signedIn.save' : 'save', {
        title: job.title,
        strong: (chunks) => (
          <strong className="wrap-anywhere" lang={lang} dir={textDirection(lang)}>
            {chunks}
          </strong>
        ),
      })}
    </p>
  )
}
