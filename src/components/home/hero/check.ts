// The checks that decide whether the hero's 3D layer may load (PLAN §10.2, D60), as a small script
// in the page itself, which runs before the poster is first painted. It marks the poster's box
// (`.home-poster`, its parent):
// - `data-hero="pending"` and `data-hero-quality="full"` or `"phone"`: the 3D layer will be tried
//   after the page's `load` (HeroLoader.tsx); the poster skips its own draw-in of the wave, since
//   the 3D layer brings the wave;
// - `data-hero="off"` and `data-hero-skip` with the reason: the poster stays, with its one draw-in
//   of the wave (global.css), and the hero's code is never requested.
// Without JavaScript nothing is marked, and the poster draws its wave once, as before.
//
// All must hold: WebGL2; motion not reduced; no forced colours (the poster is their version); no
// Save-Data; a connection faster than 3g; `deviceMemory` 4 GB or more where the browser reports it;
// a viewport at least 768px wide, or a phone (narrower) that reports 6 GB or more, or reports
// nothing (iPhones never do), which tries the phone's lighter quality and keeps it only if the
// run-time check of PLAN §10.3 passes (D60).
//
// Plain JavaScript in a string, so the page sends it as it is; the unit tests run this same text.

/** Why the 3D layer stays off (`data-hero-skip`). */
export type HeroSkip =
  | 'no-webgl2'
  | 'reduced-motion'
  | 'forced-colors'
  | 'save-data'
  | 'slow-connection'
  | 'low-memory'
  | 'small-screen'

export type HeroQuality = 'full' | 'phone'

/** The poster box's states: set by the check, then by HeroLoader and the scene. */
export type HeroState =
  | 'off' // a check failed: the poster only
  | 'pending' // checks passed; waits for the page's `load`
  | 'loading' // the 3D layer is being fetched and built
  | 'live' // the 3D layer is shown over the poster
  | 'paused' // off screen (or in a hidden tab) for 10 s: the GPU's memory given back, the poster shown
  | 'poster' // the 3D layer gave up (too slow, an error): the poster only

export const HERO_CHECK_SCRIPT = `(function(){var b=document.currentScript&&document.currentScript.parentElement;if(!b)return;var w=window,n=navigator,c=n.connection||{},m=n.deviceMemory,q=function(s){return w.matchMedia(s).matches},p=!q('(min-width: 768px)'),r=!w.WebGL2RenderingContext?'no-webgl2':!q('(prefers-reduced-motion: no-preference)')?'reduced-motion':q('(forced-colors: active)')?'forced-colors':c.saveData?'save-data':/^(slow-2g|2g|3g)$/.test(c.effectiveType)?'slow-connection':m&&m<4?'low-memory':p&&m&&m<6?'small-screen':'';b.dataset.hero=r?'off':'pending';if(r)b.dataset.heroSkip=r;else b.dataset.heroQuality=p?'phone':'full'})()`
