import { Icon } from '@/components/Icon'
import { getTranslations } from 'next-intl/server'

import { SearchForm } from '@/components/search/SearchForm'
import type { Locale } from '@/i18n/routing'

/** The dialog's id; the header's Search link and DisclosureEnhancer open it. */
export const SEARCH_DIALOG_ID = 'search-dialog'

// The search dialog (PLAN §2.3, §7.5), drawn on the server with every page, closed: a native
// <dialog> holding the search page's form, so it needs no script to be built and submits to
// /en/search/. JavaScript opens it (showModal) from Ctrl/Cmd+K or the header's Search link, which
// leads to the search page without JavaScript; Esc and the close button close it natively, and the
// browser returns focus to where it was. Live suggestions (a combobox) can join later in
// search-dialog.ts, which loads on first use.
export async function SearchDialog({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'search' })
  return (
    <dialog id={SEARCH_DIALOG_ID} className="search-dialog" aria-labelledby="search-dialog-label">
      <div className="search-dialog-panel">
        <SearchForm
          inputId="search-dialog-input"
          labelId="search-dialog-label"
          label={t('label')}
          submit={t('submit')}
        >
          <ul role="list" className="grid gap-1 text-caption text-text-muted">
            <li>{t('hintEnter')}</li>
            <li>{t('hintSyntax')}</li>
          </ul>
        </SearchForm>
        <form method="dialog" className="search-dialog-close">
          <button type="submit" className="disclosure-button size-11" aria-label={t('close')}>
            <Icon name="close" size={20} />
          </button>
        </form>
      </div>
    </dialog>
  )
}
