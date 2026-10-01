import { startProviderSignIn } from '@/lib/members/provider-routes'

// Starts signing in with Google, or linking it to the signed-in account (`?link=1`): the M4b
// design §5, §7.2 (src/lib/members/provider-routes.ts). Rendered for each request, never stored.
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return startProviderSignIn('google', request)
}
