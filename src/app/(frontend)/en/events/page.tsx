import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('events')

export default function Page() {
  return <PlaceholderPage section="events" />
}
