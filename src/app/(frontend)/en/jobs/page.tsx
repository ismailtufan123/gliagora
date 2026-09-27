import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage'

export const generateMetadata = () => placeholderMetadata('jobs')

export default function Page() {
  return <PlaceholderPage section="jobs" />
}
