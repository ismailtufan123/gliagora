import { ContentPage, contentMetadata } from '@/components/ContentPage'

// KVKK aydınlatma metni (PLAN §15.4); the text is in content/tr/legal/kvkk-aydinlatma-metni.md.
export const generateMetadata = () => contentMetadata('kvkk')

export default function Page() {
  return <ContentPage pageKey="kvkk" />
}
