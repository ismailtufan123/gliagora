import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('news')

export default function Page() {
  return <PlaceholderPage section="news" />
}
