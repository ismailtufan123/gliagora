import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'

import { HELP_PATH, editorGuideHtml } from './help'

// The editor guide in the admin (src/admin/help.ts), in the admin's own frame and side menu.
// Payload already sends signed-out visitors of its views to the sign-in page; checked here again,
// as custom views are the place where that is up to us.

export function HelpView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  const adminRoute = req.payload.config.routes.admin
  if (!req.user) {
    const here = formatAdminURL({ adminRoute, path: HELP_PATH })
    redirect(
      `${formatAdminURL({ adminRoute, path: '/login' })}?redirect=${encodeURIComponent(here)}`,
    )
  }
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={req.user}
      viewType="help"
      // A copy: React 19 refuses the read-only object Payload hands over (as in Payload's own views).
      visibleEntities={{
        collections: visibleEntities.collections,
        globals: visibleEntities.globals,
      }}
    >
      <Gutter>
        <article
          className="editor-guide"
          lang="tr"
          // Rendered from our own Markdown file, as the site's long-form pages are.
          dangerouslySetInnerHTML={{ __html: editorGuideHtml() }}
        />
      </Gutter>
    </DefaultTemplate>
  )
}
