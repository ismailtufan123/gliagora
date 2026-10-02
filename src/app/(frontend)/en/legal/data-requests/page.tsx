import { ContentPage, contentMetadata } from '@/components/ContentPage'
import { DataRequestSection } from '@/components/data-requests/DataRequestSection'

import { sendDataRequest } from './actions'

// Data requests (PLAN §15.4): the text is in content/en/legal/data-requests.md, and the form under
// it (M4b, D49; the M4b design §5, §7.8; DataRequestSection), which the text links to
// (`#request-form`). Rendered for each request, because each page gets its own spam-check
// challenge (the text is read from the file then too, which next.config.ts copies into the
// server's build). Without a mail server, the spam check or a known origin, the form says it is
// temporarily unavailable and gives the address to write to instead.
export const dynamic = 'force-dynamic'

export const generateMetadata = () => contentMetadata('dataRequests')

export default function Page() {
  return (
    <ContentPage pageKey="dataRequests" after={<DataRequestSection action={sendDataRequest} />} />
  )
}
