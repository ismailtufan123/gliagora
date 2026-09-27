import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('learn')

export default function Page() {
  return <PlaceholderPage section="learn" />
}
