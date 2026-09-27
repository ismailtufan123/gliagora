import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('suggest')

export default function Page() {
  return <PlaceholderPage section="suggest" />
}
