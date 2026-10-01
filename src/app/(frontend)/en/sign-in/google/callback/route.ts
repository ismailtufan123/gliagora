import { finishProviderSignIn } from '@/lib/members/provider-routes'

// Where Google sends the browser back (the redirect URI registered with it): the M4b design §5,
// §7.2 (src/lib/members/provider-routes.ts). Rendered for each request, never stored.
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return finishProviderSignIn('google', request)
}
