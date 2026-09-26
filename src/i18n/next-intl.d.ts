import type messages from '../../messages/en.json'
import type { Locale } from './routing'

// Type-checked message keys: a missing or misspelt key fails `pnpm typecheck`.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof messages
  }
}
