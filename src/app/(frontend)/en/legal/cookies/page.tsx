import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Cookies and storage (PLAN §15.4); the text is in content/en/legal/cookies.md.
export const generateMetadata = () => contentMetadata('cookies')

export default function Page() {
  return <ContentPage pageKey="cookies" />
}
