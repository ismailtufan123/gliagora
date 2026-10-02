import { DeletionDone } from '@/components/data-requests/AfterRequest'

// The M2 version of the page after a confirmed deletion (src/lib/public-pages.ts, D50): without
// the link to the positions, which stay private until the launch (D39).
export { generateMetadata } from '@/app/(frontend)/en/legal/data-requests/done/page'

export default function Page() {
  return <DeletionDone stage="m2" />
}
