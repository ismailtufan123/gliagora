import { AboutIntro } from '@/components/AboutIntro'
import { ContentPage, contentMetadata } from '@/components/ContentPage'

// About Gliagora (PLAN §9.11); the text is in content/en/about.md.
export const generateMetadata = () => contentMetadata('about')

export default function Page() {
  return <ContentPage pageKey="about" intro={<AboutIntro />} />
}
