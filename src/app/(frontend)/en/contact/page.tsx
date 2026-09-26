import type { Metadata } from 'next'

import { Lockup } from '@/components/Lockup'

export const metadata: Metadata = {
  title: 'Contact and legal notice',
}

// Placeholder until the full legal notice is written and reviewed (PLAN §15.4).
export default function ContactPage() {
  return (
    <main id="main" className="page">
      <Lockup size="small" href="/en/" />
      <div className="prose">
        <h1>Contact and legal notice</h1>
        <p>
          Gliagora | Neuroscience is in preparation. The full legal notice will be published on this
          page before the site opens.
        </p>
        <h2>Contact</h2>
        <p>
          Email: <a href="mailto:hello@gliagora.com">hello@gliagora.com</a>
        </p>
      </div>
    </main>
  )
}
