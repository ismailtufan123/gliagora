import { AboutIntro } from '@/components/AboutIntro'
import { ContentPage, contentMetadata } from '@/components/ContentPage'

// The M2 version of About (src/lib/public-pages.ts, D50): its links lead only to public pages
// (src/lib/m2-links.ts).
export const generateMetadata = () => contentMetadata('about')

export default function Page() {
  return <ContentPage pageKey="about" intro={<AboutIntro />} stage="m2" />
}
