import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('resources')

export default function Page() {
  return <PlaceholderPage section="resources" />
}
