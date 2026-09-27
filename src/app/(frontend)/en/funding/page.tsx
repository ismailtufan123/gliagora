import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('funding')

export default function Page() {
  return <PlaceholderPage section="funding" />
}
