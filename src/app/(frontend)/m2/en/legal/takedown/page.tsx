import { ContentPage, contentMetadata } from '@/components/ContentPage'

// The M2 version of the notice and takedown page (src/lib/public-pages.ts, D50): its links lead only to public
// pages, or to email in place of the forms (src/lib/m2-links.ts).
export const generateMetadata = () => contentMetadata('takedown')

export default function Page() {
  return <ContentPage pageKey="takedown" stage="m2" />
}
