'use client'

import { useEffect } from 'react'

import { HERO_MODEL } from './hero-model'

// Loads the hero's 3D layer (PLAN §10.3, F1) where the page's own check (check.ts) marked the
// poster's box `data-hero="pending"`: after the page's `load`, when the browser is idle (at most 2 s
// later), it fetches the scene's code and the point file together, then hands them to the scene.
// Anywhere else (another page, a check that failed, no box) it requests nothing. Any failure leaves
// the poster (`data-hero="poster"`). This part is in the home page's first script; the scene and
// three.js come in a chunk of their own (PLAN §17.3, "Hero chunk").

type Handle = { destroy(): void }

/**
 * Runs `run` after the page's `load`, once the tab is shown (a background tab slows its timers, so
 * the scene could not be built in time) and the browser is idle, or 2 s later at most.
 */
function whenIdle(run: () => void) {
  const idle = () =>
    'requestIdleCallback' in window
      ? requestIdleCallback(run, { timeout: 2000 })
      : setTimeout(run, 200)
  const shown = () => {
    if (!document.hidden) return idle()
    const onShow = () => {
      if (document.hidden) return
      document.removeEventListener('visibilitychange', onShow)
      idle()
    }
    document.addEventListener('visibilitychange', onShow)
  }
  if (document.readyState === 'complete') shown()
  else addEventListener('load', shown, { once: true })
}

export function HeroLoader() {
  useEffect(() => {
    const box = document.querySelector<HTMLElement>('.home-poster[data-hero="pending"]')
    if (!box) return
    let handle: Handle | null = null
    let gone = false
    const leaving = new AbortController()
    whenIdle(() => {
      if (gone || box.dataset.hero !== 'pending') return
      // Motion reduced or colours forced since the page's check: the poster stays.
      if (
        !matchMedia('(prefers-reduced-motion: no-preference)').matches ||
        matchMedia('(forced-colors: active)').matches
      ) {
        box.dataset.hero = 'poster'
        return
      }
      box.dataset.hero = 'loading'
      const quality = box.dataset.heroQuality === 'phone' ? 'phone' : 'full'
      Promise.all([
        // three.js's core first, then the scene with its renderer, each run in a task of its own.
        import('./three-core')
          .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
          .then(() => import('./scene')),
        fetch(HERO_MODEL.file).then((response) => {
          if (!response.ok) throw new Error(`Hero data: ${response.status}`)
          return response.arrayBuffer()
        }),
      ])
        .then(([scene, bytes]) =>
          gone ? null : scene.mountHero(box, quality, bytes, leaving.signal),
        )
        .then((mounted) => {
          if (gone) mounted?.destroy()
          else handle = mounted
        })
        .catch(() => {
          if (!gone) box.dataset.hero = 'poster'
        })
    })
    return () => {
      gone = true
      leaving.abort()
      handle?.destroy()
    }
  }, [])
  return null
}
