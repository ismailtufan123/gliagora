import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('newsletter')

export default function Page() {
  return <PlaceholderPage section="newsletter" />
}
