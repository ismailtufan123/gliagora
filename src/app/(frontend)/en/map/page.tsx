import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('map')

export default function Page() {
  return <PlaceholderPage section="map" />
}
