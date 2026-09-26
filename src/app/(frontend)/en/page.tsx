import { Lockup } from '@/components/Lockup'

// Coming-soon page (M0). Static HTML and CSS only.
export default function ComingSoonPage() {
  return (
    <main id="main" className="page-frame grid flex-1 content-center gap-8 py-12">
      <h1>
        <Lockup size="large" />
      </h1>
      <p className="max-w-[14ch] font-display text-hero leading-[1.02] font-bold tracking-[-0.01em]">
        Where neuroscience meets
      </p>
      <div className="grid max-w-measure gap-4 text-card">
        <p>
          Coming soon: a curated, English-first hub for neuroscience positions, events, funding,
          papers, news and resources.
        </p>
        <p>
          Write to us at <a href="mailto:hello@gliagora.com">hello@gliagora.com</a>.
        </p>
      </div>
    </main>
  )
}
