import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'

import type { HeroQuality, HeroState } from './check'
import { decodeHeroPoints } from './data'
import { HERO_MODEL } from './hero-model'
import {
  type IntroFrame,
  JOURNEY_PAUSE,
  JOURNEY_SHARE,
  REST,
  clamp01,
  focusAt,
  follow,
  introAt,
  journeyAt,
} from './motion'
import { FRAGMENT, VERTEX } from './shaders'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  Group,
  LinearSRGBColorSpace,
  PerspectiveCamera,
  Points,
  RawShaderMaterial,
  Scene,
  Vector3,
} from './three-core'

// The hero's 3D layer (PLAN §10, layer L2): the brain as a cloud of points over the poster, in the
// poster's box and view. Loaded by HeroLoader only where the checks of §10.2 passed, after the
// page's `load`. In order:
// - F1: built in slices (no long task), then drawn unseen for 60 frames; if building took more than
//   1.5 s or those frames ran below 30 a second, the poster stays (`data-hero="poster"`), else the
//   canvas fades in over the poster (`data-hero="live"`, 600 ms in global.css) once at least half
//   of the box is on screen;
// - F2: once per browser session, the points gather into the brain while it turns to the poster's
//   view, and one calcium wave runs across the cortex (1.6 s); afterwards nothing moves by itself;
// - F3: hovering or focusing a window's label sends a wave to that label's anchor (400 ms) and
//   marks the box (`data-hero-focus`); the other labels turn muted (global.css);
// - the brain leans a little towards the pointer, frame by frame;
// - F4, scrubbed by the page's scroll (no scroll-jacking), on the home page only: the camera dives
//   towards the glowing cell where the arrival's wave began, the points the 6b mark needs gather
//   there into one astrocyte while the others fade, then the camera pulls back as the astrocyte
//   grows into the mark's cell and its waves spread, ring after ring, into the mark's arcs; the
//   labels hand over to the figures below; F6, scrolling back runs it backwards;
// - F5: off screen or in a hidden tab, nothing is drawn, and after 10 s the GPU's memory is
//   released (`data-hero="paused"`, the poster in its place), to be built again on return. (The
//   header mark's change of §10.3 was tried and left out on two independent reviews, D60.)
// Frames are drawn only while something moves. Should 30 frames in a row come clearly slower than
// the screen's own pace (at least 20 ms), the quality steps down (fewer device pixels, then fewer
// points); below 30 a second at the lowest step, the poster stays. Reduced motion, forced colours,
// a shader that fails or a lost GPU context switch back to the poster at any time.

const PIXEL_RATIO = { full: 1.75, phone: 1.5 } as const
/** The share of points a phone draws at its best step: its brain is smaller, so as dense. */
const PHONE_POINTS = 0.75
/** The quality steps (PLAN §10.5): the device pixel ratio's cap and the share of points drawn. */
const STEPS = [
  { ratio: Infinity, points: 1 },
  { ratio: 1.25, points: 0.7 },
  { ratio: 1, points: 0.5 },
]
const BUILD_LIMIT_MS = 1500
const CHECK_FRAMES = 60
/**
 * The run-time check's floor: 30 frames a second, less a frame for the timer's jitter, so a screen
 * held at 30 Hz (a phone saving power) keeps the 3D layer.
 */
const MIN_FPS = 29
const SLOW_FRAME_MS = 20
const SLOW_FRAMES = 30
const RELEASE_AFTER_MS = 10_000
/** Session storage: the arrival has played in this tab (cookies and storage page, D60). */
export const PLAYED_KEY = 'gliagora-hero-played'
/** The camera's vertical field of view: low, so the brain looks much as the poster draws it. */
const FOV = 18
/** How far the brain leans towards the pointer, in radians. */
const LEAN = { yaw: 0.07, pitch: 0.045 }
/** The journey's scales, in scene units per unit of the mark (its viewBox is 200 wide). */
const ASTRO_SCALE = 0.0016
const MARK_SCALE = 0.0031
/**
 * How far the mark may follow the scroll down: until its outer arc (76 units from its centre) is
 * just above the canvas's feathered bottom edge (7% of its height, global.css).
 */
const MARK_SHIFT = 0.5 - 0.085 - 76 * MARK_SCALE
/** Where the arcs' points wait round the astrocyte before their rings spread, in the mark's units. */
const RING_START = 18
/** How far from the cortex the camera comes at the cell. */
const CELL_VIEW = 1.3

export type HeroHandle = { destroy(): void }

class HeroGaveUp extends Error {}

const now = () => performance.now()
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))

/** Resolves once at least `share` of the element is on screen, or once `signal` aborts. */
function inView(element: Element, share: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      watch.disconnect()
      resolve()
    }
    const watch = new IntersectionObserver(
      (entries) => {
        if ((entries.at(-1)?.intersectionRatio ?? 0) >= share) done()
      },
      { threshold: share },
    )
    watch.observe(element)
    signal.addEventListener('abort', done, { once: true })
  })
}

function played() {
  try {
    return sessionStorage.getItem(PLAYED_KEY) === '1'
  } catch {
    return false
  }
}

function remember() {
  try {
    sessionStorage.setItem(PLAYED_KEY, '1')
  } catch {
    // Storage may be blocked: the arrival then plays on every visit.
  }
}

const setState = (box: HTMLElement, state: HeroState) => {
  box.dataset.hero = state
}

/**
 * The token colours the scene draws with, read from the page (they follow light and dark). Read as
 * they are: the shaders write them straight to the canvas, so three.js must not convert them.
 */
function tokenColours(box: HTMLElement) {
  const style = getComputedStyle(box)
  const read = (name: string) =>
    new Color().setStyle(style.getPropertyValue(name).trim() || '', LinearSRGBColorSpace)
  return { ink: read('--text'), accent: read('--accent'), dapi: read('--dapi') }
}

/**
 * Builds the 3D layer in `box` (the poster's box) from the point file's bytes. Resolves once the
 * layer is shown; rejects (and leaves the poster) when it should not be, or once `signal` aborts.
 */
export async function mountHero(
  box: HTMLElement,
  quality: HeroQuality,
  bytes: ArrayBuffer,
  signal: AbortSignal,
): Promise<HeroHandle> {
  const started = now()
  const cloud = decodeHeroPoints(bytes, HERO_MODEL.box)
  await nextTask()

  const media = {
    motion: matchMedia('(prefers-reduced-motion: no-preference)'),
    forced: matchMedia('(forced-colors: active)'),
    dark: matchMedia('(prefers-color-scheme: dark)'),
  }
  const allowed = () => media.motion.matches && !media.forced.matches
  const hero = box.closest<HTMLElement>('.home-hero') ?? box
  const links = [...box.querySelectorAll<HTMLAnchorElement>('.home-poster-links a')]

  // The scene: the brain turns about its own centre.
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(cloud.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(cloud.normals, 3))
  geometry.setAttribute('shade', new BufferAttribute(cloud.shades, 1))
  // The mark's points (the first ones; any first part of the points is an even sample of the
  // brain): where each ends in the mark, and where it waits in the astrocyte before: the cell's own
  // points in their places of the mark's cell; the arcs' points close round it, in the direction
  // of their place in the arcs, with how far out their ring lies.
  const markAttr = new Float32Array(cloud.count * 4)
  const astroAttr = new Float32Array(cloud.count * 3)
  const logo = cloud.logo
  for (let i = 0; i < Math.min(logo.count, cloud.count); i++) {
    const dx = logo.positions[i * 2]! - 100
    const dy = 100 - logo.positions[i * 2 + 1]!
    const part = logo.parts[i]!
    markAttr.set([dx, dy, part, 1], i * 4)
    const radius = Math.hypot(dx, dy) || 1
    astroAttr.set(
      part === 0 ? [(dx / radius) * RING_START, (dy / radius) * RING_START, radius] : [dx, dy, 0],
      i * 3,
    )
  }
  geometry.setAttribute('mark', new BufferAttribute(markAttr, 4))
  geometry.setAttribute('astro', new BufferAttribute(astroAttr, 3))
  const centre = new Vector3(...HERO_MODEL.centre)
  const colours = tokenColours(box)
  const uniforms = {
    uSize: { value: 1 },
    uDistance: { value: 1 },
    uGather: { value: 1 },
    uOrigin: { value: new Vector3(...HERO_MODEL.origin) },
    uCentre: { value: centre.clone() },
    uReach: { value: HERO_MODEL.waveReach },
    uFloor: { value: HERO_MODEL.box.min[1] },
    uWave: { value: -1 },
    uWaveFade: { value: 0 },
    uWaveWidth: { value: HERO_MODEL.waveWidth },
    uFocus: { value: centre.clone() },
    uFocusRun: { value: 0 },
    uFocusStrength: { value: 0 },
    uInk: { value: colours.ink },
    uAccent: { value: colours.accent },
    uDapi: { value: colours.dapi },
    uOpacity: { value: 1 },
    uDark: { value: media.dark.matches ? 1 : 0 },
    uScroll: { value: 0 },
    uToCell: { value: 0 },
    uAstroCentre: { value: new Vector3(...HERO_MODEL.origin) },
    uAstroScale: { value: ASTRO_SCALE },
    uMarkCentre: { value: new Vector3() },
    uMarkScale: { value: MARK_SCALE },
    uZoom: { value: 0 },
    uToMark: { value: 0 },
    uDive: { value: 0 },
  }
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  })
  const points = new Points(geometry, material)
  points.position.copy(centre).negate()
  const brain = new Group()
  brain.position.copy(centre)
  brain.add(points)
  const scene = new Scene()
  scene.add(brain)
  const distance = 0.5 / Math.tan(((FOV / 2) * Math.PI) / 180)
  const camera = new PerspectiveCamera(FOV, HERO_MODEL.aspect, 0.05, distance + 2)
  camera.position.set(0, 0, distance)
  uniforms.uDistance.value = distance
  // The journey's camera: from home to just above the cell, looking at it.
  const cellAt = new Vector3(...HERO_MODEL.origin)
  const home = new Vector3(0, 0, distance)
  const atCell = cellAt.clone().add(new Vector3(0.05, 0, CELL_VIEW))
  const look = new Vector3()
  const origin = new Vector3()
  await nextTask()

  // The canvas, unseen until the checks pass (global.css).
  let canvas: HTMLCanvasElement | null = null
  let renderer: WebGLRenderer | null = null
  let step = 0
  let lost = false
  let broken = false
  /** Everything set up and shown: from then on, giving up cleans up and shows the poster. */
  let ready = false
  let destroyed = false

  function resize() {
    if (!renderer || !canvas) return
    const width = box.clientWidth
    const height = width / HERO_MODEL.aspect
    const ratio = Math.min(devicePixelRatio || 1, PIXEL_RATIO[quality], STEPS[step]!.ratio)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)
    // Points about 1.6 CSS pixels wide on a poster 500px wide, a little larger on smaller ones.
    uniforms.uSize.value = ratio * Math.max(1.35, Math.min(2.1, 1.6 * Math.sqrt(width / 500)))
    const share = STEPS[step]!.points * (quality === 'phone' ? PHONE_POINTS : 1)
    geometry.setDrawRange(0, Math.round(cloud.count * share))
  }

  /** Whether the context is gone or a shader failed: nothing drawn could be trusted. */
  const failed = () => lost || broken || !renderer || renderer.getContext().isContextLost()

  async function build(): Promise<WebGLRenderer> {
    lost = false
    broken = false
    const next = document.createElement('canvas')
    next.className = 'hero-canvas'
    next.setAttribute('aria-hidden', 'true')
    next.addEventListener('webglcontextlost', onLost)
    let made: WebGLRenderer
    try {
      made = new WebGLRenderer({
        canvas: next,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      })
    } catch (error) {
      next.removeEventListener('webglcontextlost', onLost)
      throw error
    }
    made.debug.onShaderError = () => {
      broken = true
    }
    made.setClearColor(0x000000, 0)
    box.prepend(next)
    canvas = next
    renderer = made
    resize()
    await nextTask()
    await made.compileAsync(scene, camera)
    return made
  }

  function release() {
    if (!renderer || !canvas) return
    // Our own release loses the context on purpose: not a reason to give up.
    canvas.removeEventListener('webglcontextlost', onLost)
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
    renderer = null
    canvas = null
  }

  // How far the page has scrolled through the journey (F4): the target, and the frames' smoothed
  // value that follows it. It starts once the whole brain is in view (on a phone the poster lies
  // below the text; on a wide screen it is in view from the top of the page) and the page has
  // moved on a little more (JOURNEY_PAUSE). Not on a page with too little below the hero to
  // finish it (the coming-soon page: `data-hero-journey="off"`, HeroStage).
  const art = box.querySelector('svg') ?? box
  const journeyOn = box.dataset.heroJourney !== 'off'
  const journeyTarget = () => {
    if (!journeyOn) return 0
    const viewport = document.documentElement.clientHeight
    const start = Math.max(0, art.getBoundingClientRect().bottom + scrollY - viewport)
    const length = Math.max(1, JOURNEY_SHARE * hero.getBoundingClientRect().height)
    return clamp01((scrollY - start - JOURNEY_PAUSE) / length)
  }
  let journey = journeyTarget()

  // What the scene shows now.
  let introStart: number | null = null
  let focus: { to: Vector3; start: number; leftAt: number | null } | null = null
  const lean = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 }
  let last = 0

  /** Sets this frame's values; returns whether anything still moves. */
  function update(time: number, fixed?: IntroFrame) {
    const seconds = last ? Math.min(0.1, (time - last) / 1000) : 0
    last = time
    const intro = fixed ?? (introStart === null ? REST : introAt((time - introStart) / 1000))
    uniforms.uGather.value = intro.gather
    uniforms.uWave.value = intro.wave < 0 ? -1 : intro.wave * HERO_MODEL.waveReach
    uniforms.uWaveFade.value = intro.waveFade
    lean.yaw = follow(lean.yaw, lean.targetYaw, seconds)
    lean.pitch = follow(lean.pitch, lean.targetPitch, seconds)

    // The journey (F4, F6), following the scroll smoothly.
    const goal = journeyTarget()
    journey = seconds ? follow(journey, goal, seconds, 10) : journey
    if (Math.abs(journey - goal) < 1e-4) journey = goal
    const j = journeyAt(journey)
    brain.rotation.set(lean.pitch * j.still, (intro.turn + lean.yaw) * j.still, 0)
    const boxHeight = Math.max(1, box.clientWidth / HERO_MODEL.aspect)
    uniforms.uMarkCentre.value.set(0, -Math.min(scrollY / boxHeight, MARK_SHIFT) * j.toMark, 0)
    uniforms.uScroll.value = journey
    uniforms.uToCell.value = j.toCell
    uniforms.uAstroCentre.value.lerpVectors(cellAt, uniforms.uMarkCentre.value, j.toMark)
    uniforms.uAstroScale.value = ASTRO_SCALE + (MARK_SCALE - ASTRO_SCALE) * j.toMark
    uniforms.uZoom.value = j.zoom
    uniforms.uToMark.value = j.toMark
    uniforms.uDive.value = j.dive
    camera.position.lerpVectors(home, atCell, j.zoom)
    camera.lookAt(look.lerpVectors(origin, cellAt, j.zoom))
    box.style.setProperty('--hero-labels', j.labels.toFixed(3))
    box.dataset.heroLabels = j.labels < 0.01 ? 'gone' : 'shown'

    let moving = intro.moving || journey !== goal
    if (focus) {
      const f = focusAt(
        (time - focus.start) / 1000,
        focus.leftAt === null ? null : (focus.leftAt - focus.start) / 1000,
      )
      uniforms.uFocus.value.copy(focus.to)
      uniforms.uFocusRun.value = f.run
      uniforms.uFocusStrength.value = f.strength
      if (!f.moving && focus.leftAt !== null) focus = null
      moving ||= f.moving
    }
    if (!intro.moving && introStart !== null) introStart = null
    return (
      moving ||
      Math.abs(lean.yaw - lean.targetYaw) > 1e-4 ||
      Math.abs(lean.pitch - lean.targetPitch) > 1e-4
    )
  }

  // The frame loop: runs only while something moves, and only while the box is on screen.
  let frame = 0
  let visible = true
  let previous = 0
  /** A frame counts as slow above this: 20 ms, or a quarter more than the screen's own pace. */
  let slowAfter = SLOW_FRAME_MS
  const slow = { frames: 0, total: 0 }

  function draw(time: number) {
    frame = 0
    // Not while the layer is being built again: its shaders may not be ready (compileAsync).
    if (!renderer || !visible || restoring) return
    const interval = previous ? time - previous : 0
    const moving = update(time)
    renderer.render(scene, camera)
    previous = moving ? time : 0
    // Quality steps (PLAN §10.5), measured only between frames drawn one after another.
    if (interval > slowAfter) {
      slow.frames++
      slow.total += interval
    } else if (interval) {
      slow.frames = 0
      slow.total = 0
    }
    if (slow.frames >= SLOW_FRAMES) {
      const average = slow.total / slow.frames
      slow.frames = 0
      slow.total = 0
      if (step < STEPS.length - 1) {
        step++
        // A new size clears the canvas: draw the frame again at once.
        resize()
        renderer.render(scene, camera)
      } else if (average > 1000 / MIN_FPS) {
        giveUp()
        return
      }
    }
    if (moving) wake()
    else last = 0
  }

  function wake() {
    if (!frame && renderer && visible) frame = requestAnimationFrame(draw)
  }

  // Build, then the run-time check of F1: 60 frames drawn unseen, timed by the frames themselves.
  const gl = await build()
  const intro = !played()
  update(now(), intro ? introAt(0) : REST)
  gl.render(scene, camera)
  if (now() - started > BUILD_LIMIT_MS || failed()) {
    release()
    throw new HeroGaveUp('build too slow or failed')
  }
  let first = 0
  let latest = 0
  for (let i = 0; i <= CHECK_FRAMES; i++) {
    latest = await nextFrame()
    if (i === 0) first = latest
    else gl.render(scene, camera)
  }
  const pace = (latest - first) / CHECK_FRAMES
  if (1000 / pace < MIN_FPS || failed()) {
    release()
    throw new HeroGaveUp('too slow or failed')
  }
  slowAfter = Math.max(SLOW_FRAME_MS, pace * 1.25)

  // Shown once at least half of it is on screen, so that the arrival is seen (on a phone the
  // poster may still be below the fold), unless the page has gone, or motion became reduced or
  // colours forced, meanwhile.
  await inView(box, 0.5, signal)
  if (signal.aborted || failed() || !allowed()) {
    release()
    throw new HeroGaveUp('gone or not wanted any more')
  }
  setState(box, 'live')
  if (intro) {
    introStart = now()
    remember()
  }
  journey = journeyTarget()
  last = 0
  wake()

  // Hover and focus on a label (F3).
  function focusOn(link: HTMLAnchorElement) {
    const key = link.closest<HTMLElement>('[data-window]')?.dataset.window
    const anchor = key ? HERO_MODEL.anchors[key] : undefined
    box.dataset.heroFocus = key ?? ''
    if (!anchor) return
    focus = { to: new Vector3(...anchor), start: now(), leftAt: null }
    wake()
  }
  function focusOff() {
    delete box.dataset.heroFocus
    if (focus && focus.leftAt === null) focus.leftAt = now()
    wake()
  }
  const onEnter = (event: Event) => focusOn(event.currentTarget as HTMLAnchorElement)
  const onFocusIn = (event: FocusEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('.home-poster-links a')
    if (link) focusOn(link)
  }
  const onFocusOut = () => focusOff()
  for (const link of links) {
    link.addEventListener('pointerenter', onEnter)
    link.addEventListener('pointerleave', focusOff)
  }
  box.addEventListener('focusin', onFocusIn)
  box.addEventListener('focusout', onFocusOut)

  // Leaning towards the pointer: the latest position only, applied in the next frame.
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    const rect = box.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1
    lean.targetYaw = Math.max(-1, Math.min(1, x)) * LEAN.yaw
    lean.targetPitch = Math.max(-1, Math.min(1, y)) * LEAN.pitch
    wake()
  }
  const onPointerLeave = () => {
    lean.targetYaw = 0
    lean.targetPitch = 0
    wake()
  }
  hero.addEventListener('pointermove', onPointerMove, { passive: true })
  hero.addEventListener('pointerleave', onPointerLeave)

  // The scroll drives the journey.
  const onScroll = () => wake()
  addEventListener('scroll', onScroll, { passive: true })

  // On and off screen, and in a hidden tab (F5). Built again a little before it comes back.
  let onScreen = true
  let releaseTimer = 0
  function pause() {
    release()
    setState(box, 'paused')
  }
  function seen() {
    visible = onScreen && !document.hidden
    if (visible) {
      clearTimeout(releaseTimer)
      releaseTimer = 0
      // Where the scroll is now, not where it was when the hero left.
      journey = journeyTarget()
      if (!renderer) void restore()
      else wake()
    } else {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      last = 0
      previous = 0
      if (!releaseTimer && renderer) releaseTimer = window.setTimeout(pause, RELEASE_AFTER_MS)
    }
  }
  const observer = new IntersectionObserver(
    (entries) => {
      onScreen = entries.at(-1)?.isIntersecting ?? true
      seen()
    },
    { rootMargin: '25% 0px' },
  )
  observer.observe(box)
  document.addEventListener('visibilitychange', seen)

  let restoring = false
  async function restore() {
    if (restoring) return
    restoring = true
    setState(box, 'loading')
    try {
      await build()
      if (destroyed) return release()
      renderer?.render(scene, camera)
      if (failed()) throw new HeroGaveUp('failed again')
      restoring = false
      journey = journeyTarget()
      setState(box, 'live')
      wake()
    } catch {
      giveUp()
    } finally {
      restoring = false
    }
  }

  // Back to the poster when motion is reduced, colours are forced or the context is lost.
  const onScheme = () => {
    const next = tokenColours(box)
    uniforms.uInk.value.copy(next.ink)
    uniforms.uAccent.value.copy(next.accent)
    uniforms.uDapi.value.copy(next.dapi)
    uniforms.uDark.value = media.dark.matches ? 1 : 0
    if (renderer) renderer.render(scene, camera)
  }
  const onMotion = () => {
    if (!allowed()) giveUp()
  }
  media.dark.addEventListener('change', onScheme)
  media.motion.addEventListener('change', onMotion)
  media.forced.addEventListener('change', onMotion)
  function onLost() {
    lost = true
    // Before the layer is shown, the run-time check sees `lost` and gives up itself.
    if (renderer && ready) giveUp()
  }
  const onResize = () => {
    resize()
    if (renderer && !restoring) renderer.render(scene, camera)
    wake()
  }
  const sizeObserver = new ResizeObserver(onResize)
  sizeObserver.observe(box)

  function destroy() {
    if (destroyed) return
    destroyed = true
    if (frame) cancelAnimationFrame(frame)
    clearTimeout(releaseTimer)
    observer.disconnect()
    sizeObserver.disconnect()
    document.removeEventListener('visibilitychange', seen)
    removeEventListener('scroll', onScroll)
    box.style.removeProperty('--hero-labels')
    delete box.dataset.heroLabels
    for (const link of links) {
      link.removeEventListener('pointerenter', onEnter)
      link.removeEventListener('pointerleave', focusOff)
    }
    box.removeEventListener('focusin', onFocusIn)
    box.removeEventListener('focusout', onFocusOut)
    hero.removeEventListener('pointermove', onPointerMove)
    hero.removeEventListener('pointerleave', onPointerLeave)
    media.dark.removeEventListener('change', onScheme)
    media.motion.removeEventListener('change', onMotion)
    media.forced.removeEventListener('change', onMotion)
    release()
    geometry.dispose()
    material.dispose()
    delete box.dataset.heroFocus
  }

  function giveUp() {
    destroy()
    setState(box, 'poster')
  }

  ready = true
  return { destroy }
}
