import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Notice and takedown, corrections (PLAN §15.4); the text is in content/en/legal/takedown.md.
export const generateMetadata = () => contentMetadata('takedown')

export default function Page() {
  return <ContentPage pageKey="takedown" />
}
