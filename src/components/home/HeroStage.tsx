import type { ReactNode } from 'react'

import { HomePoster } from './HomePoster'
import { HERO_CHECK_SCRIPT } from './hero/check'
import { HeroLoader } from './hero/HeroLoader'

// The hero's picture (PLAN §10): the poster (L1) in its box, with the page's own check that runs
// before the poster is painted and marks the box (hero/check.ts; React leaves the box's marks
// alone: suppressHydrationWarning), and HeroLoader, which loads the 3D layer (L2) where the check
// lets it. On the home page the windows' links go inside, around the brain (`children`); on the M2
// coming-soon page there are none (D60), since they lead to private pages.

export function HeroStage({ children }: { children?: ReactNode }) {
  return (
    <div className="home-poster" suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: HERO_CHECK_SCRIPT }} />
      <HeroLoader />
      <HomePoster />
      {children}
    </div>
  )
}
