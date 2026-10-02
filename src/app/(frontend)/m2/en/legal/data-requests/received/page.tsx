import { RequestReceived } from '@/components/data-requests/AfterRequest'

// The M2 version of the page after another confirmed request (src/lib/public-pages.ts, D50):
// without the link to the positions, which stay private until the launch (D39).
export { generateMetadata } from '@/app/(frontend)/en/legal/data-requests/received/page'

export default function Page() {
  return <RequestReceived stage="m2" />
}
