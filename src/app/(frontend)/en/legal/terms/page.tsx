import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Terms of use (PLAN §15.4); the text is in content/en/legal/terms.md.
export const generateMetadata = () => contentMetadata('terms')

export default function Page() {
  return <ContentPage pageKey="terms" />
}
