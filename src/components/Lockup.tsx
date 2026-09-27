type LockupProps = {
  size: 'large' | 'small' | 'header'
  /** "Gliagora" and "Neuroscience" (brand.name, brand.descriptor in the messages). */
  name: string
  descriptor: string
  /** Link target; the large lockup on the home page is not a link. */
  href?: string
}

const markSize = { large: 64, small: 40, header: 32 }
const textSize = { large: 'text-body sm:text-h3', small: 'text-card', header: 'text-body' }
const gap = { large: 'gap-2 sm:gap-3', small: 'gap-3', header: 'gap-1.5 sm:gap-2' }
// Lockups must fit a 320px screen: the header one next to the menu button.
const markClass = { large: 'size-10 sm:size-16', small: '', header: 'size-7 sm:size-8' }

// Logo 6b (D12): the light mark by default, the dark mark when the system uses dark mode.
// At 32px and below, the simplified small mark (D24).
function Mark({ size, className }: { size: number; className: string }) {
  const file = size <= 32 ? 'gliagora-mark-small' : 'gliagora-mark'
  return (
    <picture className="shrink-0">
      <source srcSet={`/brand/${file}-dark.svg`} media="(prefers-color-scheme: dark)" />
      <img src={`/brand/${file}.svg`} alt="" width={size} height={size} className={className} />
    </picture>
  )
}

function Content({ size, name, descriptor }: Omit<LockupProps, 'href'>) {
  return (
    <>
      <Mark size={markSize[size]} className={markClass[size]} />
      <span>{name}</span>
      {/* A border rather than a background, so it stays visible in forced-colours mode. */}
      <span
        className="my-[0.2em] shrink-0 self-stretch border-s-2 border-line-strong"
        aria-hidden="true"
      />
      <span className="font-semibold">{descriptor}</span>
    </>
  )
}

export function Lockup({ size, name, descriptor, href }: LockupProps) {
  const className = `flex items-center font-display font-bold text-text no-underline ${gap[size]} ${textSize[size]}`
  if (href) {
    return (
      <a className={className} href={href}>
        <Content size={size} name={name} descriptor={descriptor} />
      </a>
    )
  }
  return (
    <span className={className}>
      <Content size={size} name={name} descriptor={descriptor} />
    </span>
  )
}
