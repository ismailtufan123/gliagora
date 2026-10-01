import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Icon } from '@/components/Icon'
import { textDirection } from '@/lib/jobs/languages'
import { MEMBER_PATHS } from '@/lib/members/paths'
import type { SaveContext } from '@/lib/members/save-context'
import { SAVE_INPUTS, SAVE_NOTE_ID, SAVE_STATUS_ID, signInToSave } from '@/lib/members/saved'

// The Save control of a position (M4b, D49; the M4b design §3, PLAN §7.5), drawn on the server
// from the page's Save context (src/lib/members/save-context.ts): nothing while no way of signing
// in is on; for visitors who are signed out, a link to sign in that saves the position afterwards;
// for members, a form that posts the state they want to /en/account/saved/toggle/ and works
// without JavaScript. With JavaScript, the submit is taken over by a few lines that every page
// carries (DisclosureEnhancer), which load the rest (save-toggle.ts) on first use: the button
// changes in place and the page's live region says "Saved: …"; focus stays on the button.
//
// The button is a toggle (aria-pressed): its label stays "Save", and its state shows as a filled
// style and another icon (a bookmark with a tick), so not by colour alone and also in forced
// colours. Its name starts with the visible word and adds the position's title for screen readers
// (WCAG 2.5.3), in the title's own language. The texts the script announces come from the
// messages, in data attributes, so the script holds no text.

export type SaveJob = {
  id: number
  shortId: string
  title: string
  /** ISO 639-1 code of the posting's language (the title's). */
  originalLanguage: string
}

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
  const lang = job.originalLanguage !== 'en' ? job.originalLanguage : undefined
  const label = t.rich('label', {
    hidden: (chunks: ReactNode) => <span className="sr-only">{chunks}</span>,
    job: (chunks: ReactNode) => (
      <span lang={lang} dir={textDirection(lang)}>
        {chunks}
      </span>
    ),
    title: job.title,
  })

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
        {label}
      </button>
    </form>
  )
}

/**
 * Once on a page with Save controls: for members, the live region the script writes "Saved: …"
 * into (empty until then); for visitors who are signed out, the hidden note the Save links point
 * to ("You need to sign in to save positions").
 */
export async function SaveRegion({ context }: { context: SaveContext | null }) {
  if (!context) return null
  if (context.signedIn) return <p id={SAVE_STATUS_ID} role="status" className="sr-only" />
  const t = await getTranslations({ locale: 'en', namespace: 'save' })
  return (
    <p id={SAVE_NOTE_ID} className="sr-only">
      {t('signInNote')}
    </p>
  )
}
