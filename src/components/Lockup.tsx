type LockupProps = {
  size: 'large' | 'small'
  /** Link target; the large lockup on the home page is not a link. */
  href?: string
}

const markSize = { large: 64, small: 40 }
const textSize = { large: 'text-h3', small: 'text-card' }

// Logo 6b (D12): the light mark by default, the dark mark when the system uses dark mode.
function Mark({ size }: { size: number }) {
  return (
    <picture>
      <source srcSet="/brand/gliagora-mark-dark.svg" media="(prefers-color-scheme: dark)" />
      <img src="/brand/gliagora-mark.svg" alt="" width={size} height={size} />
    </picture>
  )
}

function Content({ size }: { size: LockupProps['size'] }) {
  return (
    <>
      <Mark size={markSize[size]} />
      <span>Gliagora</span>
      <span className="my-[0.2em] w-0.5 self-stretch bg-line-strong" aria-hidden="true" />
      <span className="font-semibold">Neuroscience</span>
    </>
  )
}

export function Lockup({ size, href }: LockupProps) {
  const className = `flex items-center gap-3 font-display font-bold text-text no-underline ${textSize[size]}`
  if (href) {
    return (
      <a className={className} href={href}>
        <Content size={size} />
      </a>
    )
  }
  return (
    <span className={className}>
      <Content size={size} />
    </span>
  )
}
