import { ContentPage, contentMetadata } from '@/components/ContentPage'
import { DataRequestSection } from '@/components/data-requests/DataRequestSection'

import { sendDataRequest } from '@/app/(frontend)/en/legal/data-requests/actions'

// The M2 version of the data-requests page with its form (src/lib/public-pages.ts, D50): its links,
// the text's and the form's, lead only to public pages (src/lib/m2-links.ts). The form is the
// page's own, with the same Server Action, which the form posts to the page's address. Rendered for
// each request, like the page (its text is read from the file then, which next.config.ts copies
// into the server's build).
export const dynamic = 'force-dynamic'

export const generateMetadata = () => contentMetadata('dataRequests')

export default function Page() {
  return (
    <ContentPage
      pageKey="dataRequests"
      after={<DataRequestSection action={sendDataRequest} stage="m2" />}
      stage="m2"
    />
  )
}
