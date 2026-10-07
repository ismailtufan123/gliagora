import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Accessibility statement (PLAN §15.4, §17); the text is in content/en/legal/accessibility.md.
export const generateMetadata = () => contentMetadata('accessibility')

export default function Page() {
  return <ContentPage pageKey="accessibility" />
}
