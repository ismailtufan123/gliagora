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
// Lockups must fit a 320px screen: the header one next to the menu button. The mark is a picture,
// so it keeps its size when text is enlarged (px); the words and gaps grow with the text, and
// global.css drops or wraps the descriptor where they no longer fit (WCAG 1.4.4, 1.4.10). Keep
// the sizes in step with the widths there.
const markClass = {
  large: 'size-[40px] sm:size-[64px]',
  small: '',
  header: 'size-[28px] sm:size-[32px]',
}

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
      <span className="lockup-name">{name}</span>
      {/* A border rather than a background, so it stays visible in forced-colours mode. */}
      <span
        className="lockup-rule my-[0.2em] shrink-0 self-stretch border-s-2 border-line-strong"
        aria-hidden="true"
      />
      <span className="lockup-descriptor font-semibold">{descriptor}</span>
    </>
  )
}

// The frame is the container that global.css measures; it carries the text size, so that `em`
// there is the lockup's. The lockup is the brand, the same in every language: translate="no"
// keeps browser translation (and the pseudo-locale tests) from changing it.
export function Lockup({ size, name, descriptor, href }: LockupProps) {
  const className = `lockup lockup-${size} flex items-center font-display font-bold text-text no-underline ${gap[size]}`
  return (
    <div className={`lockup-frame-${size} ${textSize[size]}`}>
      {href ? (
        <a className={className} href={href} translate="no">
          <Content size={size} name={name} descriptor={descriptor} />
        </a>
      ) : (
        <span className={className} translate="no">
          <Content size={size} name={name} descriptor={descriptor} />
        </span>
      )}
    </div>
  )
}
