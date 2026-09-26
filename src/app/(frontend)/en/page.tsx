import { Lockup } from '@/components/Lockup'

// Coming-soon page (M0). Static HTML and CSS only.
export default function ComingSoonPage() {
  return (
    <main id="main" className="page coming-soon">
      <h1>
        <Lockup size="large" />
      </h1>
      <p className="coming-soon__tagline">Where neuroscience meets</p>
      <div className="coming-soon__text">
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
