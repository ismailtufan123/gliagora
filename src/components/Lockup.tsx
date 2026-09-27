type LockupProps = {
  size: 'large' | 'small' | 'header'
  /** "Gliagora" and "Neuroscience" (brand.name, brand.descriptor in the messages). */
  name: string
  descriptor: string
  /** Link target; the large lockup on the home page is not a link. */
  href?: string
}

const markSize = { large: 64, small: 40, header: 32 }
const textSize = { large: 'text-h3', small: 'text-card', header: 'text-body' }
const gap = { large: 'gap-3', small: 'gap-3', header: 'gap-2' }

// Logo 6b (D12): the light mark by default, the dark mark when the system uses dark mode.
function Mark({ size }: { size: number }) {
  return (
    <picture className="shrink-0">
      <source srcSet="/brand/gliagora-mark-dark.svg" media="(prefers-color-scheme: dark)" />
      <img src="/brand/gliagora-mark.svg" alt="" width={size} height={size} />
    </picture>
  )
}

function Content({ size, name, descriptor }: Omit<LockupProps, 'href'>) {
  return (
    <>
      <Mark size={markSize[size]} />
      <span>{name}</span>
      {/* A border rather than a background, so it stays visible in forced-colours mode. */}
      <span className="my-[0.2em] self-stretch border-s-2 border-line-strong" aria-hidden="true" />
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
