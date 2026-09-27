import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('papers')

export default function Page() {
  return <PlaceholderPage section="papers" />
}
