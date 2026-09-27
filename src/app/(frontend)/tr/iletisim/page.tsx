import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Contact and legal notice in Turkish (PLAN §2.2, §15.4); the text is in content/tr/iletisim.md.
export const generateMetadata = () => contentMetadata('iletisim')

export default function Page() {
  return <ContentPage pageKey="iletisim" />
}
