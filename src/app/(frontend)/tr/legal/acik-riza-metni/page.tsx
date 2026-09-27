import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Açık rıza metni for Glia Notes (PLAN §15.4); the text is in content/tr/legal/acik-riza-metni.md.
export const generateMetadata = () => contentMetadata('acikRiza')

export default function Page() {
  return <ContentPage pageKey="acikRiza" />
}
