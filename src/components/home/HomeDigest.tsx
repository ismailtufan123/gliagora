import { getTranslations } from 'next-intl/server'

import { paths } from '@/lib/site'

// Glia Notes, the monthly digest (PLAN §13), near the hero and before the footer (PLAN §3.2
// "Home"). Until the signup opens (M2), both lead to the newsletter page, as the header's button
// does; at M2 they become the signup form.

export async function HomeDigest({ variant }: { variant: 'short' | 'full' }) {
  const t = await getTranslations({ locale: 'en', namespace: 'home.digest' })
  if (variant === 'short') {
    return (
      <p className="home-digest-short page-frame">
        <span>{t('short')}</span> <a href={paths.section('newsletter')}>{t('button')}</a>
      </p>
    )
  }
  return (
    <section className="home-digest" aria-labelledby="home-digest-title">
      <div className="page-frame">
        <h2 id="home-digest-title" className="text-h2">
          {t('title')}
        </h2>
        <p>{t('text')}</p>
        <a className="button button-primary" href={paths.section('newsletter')}>
          {t('button')}
        </a>
      </div>
    </section>
  )
}
