import { ContentPage, contentMetadata } from '@/components/ContentPage'

// The M2 version of the KVKK information notice (src/lib/public-pages.ts, D50): its links lead only to public
// pages, or to email in place of the forms (src/lib/m2-links.ts).
export const generateMetadata = () => contentMetadata('kvkk')

export default function Page() {
  return <ContentPage pageKey="kvkk" stage="m2" />
}
