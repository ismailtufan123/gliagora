import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Sources and editorial policy (PLAN §6, §15.4); the text is in content/en/about/sources.md.
export const generateMetadata = () => contentMetadata('sources')

export default function Page() {
  return <ContentPage pageKey="sources" />
}
