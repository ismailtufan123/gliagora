import { ContentPage, contentMetadata } from '@/components/ContentPage'

// Data requests (PLAN §15.4); the text is in content/en/legal/data-requests.md.
export const generateMetadata = () => contentMetadata('dataRequests')

export default function Page() {
  return <ContentPage pageKey="dataRequests" />
}
