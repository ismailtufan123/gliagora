import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Privacy notice (PLAN §15.4); the text is in content/en/legal/privacy.md.
export const generateMetadata = () => contentMetadata('privacy')

export default function Page() {
  return <ContentPage pageKey="privacy" />
}
