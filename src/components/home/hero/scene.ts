import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'

import type { HeroQuality, HeroState } from './check'
import { decodeHeroPoints } from './data'
import { HERO_MODEL } from './hero-model'
import { type IntroFrame, REST, focusAt, follow, introAt } from './motion'
import { FRAGMENT, VERTEX } from './shaders'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  Group,
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
//   canvas fades in over the poster (`data-hero="live"`, 300 ms in global.css);
// - F2: once per browser session, the points gather into the brain while it turns to the poster's
//   view, and one calcium wave runs across the cortex (1.6 s); afterwards nothing moves by itself;
// - F3: hovering or focusing a window's label sends a wave to that label's anchor (400 ms) and
//   marks the box (`data-hero-focus`), which reveals the label's count in global.css;
// - the brain leans a little towards the pointer, frame by frame;
// - F5: off screen, nothing is drawn, the header's mark is filled again (`data-hero-mark` on
//   <html>), and after 10 s the GPU's memory is released, to be built again on return.
// Frames are drawn only while something moves. Should frames take longer than 20 ms for 30 frames
// in a row, the quality steps down (fewer device pixels, then fewer points); below 30 a second at
// the lowest step, the poster stays. Reduced motion, forced colours or a lost GPU context switch
// back to the poster at any time.

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
const MIN_FPS = 30
const SLOW_FRAME_MS = 20
const SLOW_FRAMES = 30
const RELEASE_AFTER_MS = 10_000
/** Session storage: the arrival has played in this tab (cookies and storage page, D60). */
export const PLAYED_KEY = 'gliagora-hero-played'
/** The camera's vertical field of view: low, so the brain looks much as the poster draws it. */
const FOV = 18
/** How far the brain leans towards the pointer, in radians. */
const LEAN = { yaw: 0.07, pitch: 0.045 }

export type HeroHandle = { destroy(): void }

class HeroGaveUp extends Error {}

const now = () => performance.now()
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))

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

/** The token colours the scene draws with, read from the page (they follow light and dark). */
function tokenColours(box: HTMLElement) {
  const style = getComputedStyle(box)
  const read = (name: string) => new Color(style.getPropertyValue(name).trim() || undefined)
  return { ink: read('--text'), accent: read('--accent'), dapi: read('--dapi') }
}

/**
 * Builds the 3D layer in `box` (the poster's box) from the point file's bytes. Resolves once the
 * layer is shown; rejects (and leaves the poster) when it should not be.
 */
export async function mountHero(
  box: HTMLElement,
  quality: HeroQuality,
  bytes: ArrayBuffer,
): Promise<HeroHandle> {
  const started = now()
  const cloud = decodeHeroPoints(bytes, HERO_MODEL.box)
  await nextTask()

  const media = {
    motion: matchMedia('(prefers-reduced-motion: no-preference)'),
    forced: matchMedia('(forced-colors: active)'),
    dark: matchMedia('(prefers-color-scheme: dark)'),
  }
  const hero = box.closest<HTMLElement>('.home-hero') ?? box
  const links = [...box.querySelectorAll<HTMLAnchorElement>('.home-poster-links a')]

  // The scene: the brain turns about its own centre.
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(cloud.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(cloud.normals, 3))
  geometry.setAttribute('shade', new BufferAttribute(cloud.shades, 1))
  const centre = new Vector3(...HERO_MODEL.centre)
  const colours = tokenColours(box)
  const uniforms = {
    uSize: { value: 1 },
    uDistance: { value: 1 },
    uGather: { value: 1 },
    uOrigin: { value: new Vector3(...HERO_MODEL.origin) },
    uCentre: { value: centre.clone() },
    uWave: { value: -1 },
    uWaveWidth: { value: HERO_MODEL.waveWidth },
    uFocus: { value: centre.clone() },
    uFocusRun: { value: 0 },
    uFocusStrength: { value: 0 },
    uInk: { value: colours.ink },
    uAccent: { value: colours.accent },
    uDapi: { value: colours.dapi },
    uOpacity: { value: 1 },
    uDark: { value: media.dark.matches ? 1 : 0 },
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
  const camera = new PerspectiveCamera(FOV, HERO_MODEL.aspect, distance - 1, distance + 1)
  camera.position.set(0, 0, distance)
  uniforms.uDistance.value = distance
  await nextTask()

  // The canvas, unseen until the checks pass (global.css).
  let canvas: HTMLCanvasElement | null = null
  let renderer: WebGLRenderer | null = null
  let step = 0
  let lost = false

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

  async function build(): Promise<WebGLRenderer> {
    canvas = document.createElement('canvas')
    canvas.className = 'hero-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.addEventListener('webglcontextlost', onLost)
    box.prepend(canvas)
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    renderer.setClearColor(0x000000, 0)
    const built = renderer
    resize()
    await nextTask()
    await built.compileAsync(scene, camera)
    lost = false
    return built
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
    lean.yaw = follow(lean.yaw, lean.targetYaw, seconds)
    lean.pitch = follow(lean.pitch, lean.targetPitch, seconds)
    brain.rotation.set(lean.pitch, intro.turn + lean.yaw, 0)
    let moving = intro.moving
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
  const slow = { frames: 0, total: 0 }

  function draw(time: number) {
    frame = 0
    if (!renderer || !visible) return
    const interval = previous ? time - previous : 0
    const moving = update(time)
    renderer.render(scene, camera)
    previous = moving ? time : 0
    // Quality steps (PLAN §10.5), measured only between frames drawn one after another.
    if (interval > SLOW_FRAME_MS) {
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
        resize()
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

  // Build, then the run-time check of F1: 60 frames drawn unseen.
  const gl = await build()
  const intro = !played()
  const opening = intro ? introAt(0) : REST
  update(now(), opening)
  gl.render(scene, camera)
  if (now() - started > BUILD_LIMIT_MS) {
    release()
    throw new HeroGaveUp('build too slow')
  }
  let first = 0
  for (let i = 0; i <= CHECK_FRAMES; i++) {
    const time = await nextFrame()
    if (i === 0) first = time
    else gl.render(scene, camera)
  }
  const fps = (CHECK_FRAMES * 1000) / (now() - first)
  if (fps < MIN_FPS || lost) {
    release()
    throw new HeroGaveUp('too slow')
  }

  // Shown.
  setState(box, 'live')
  document.documentElement.dataset.heroMark = 'outline'
  if (intro) {
    introStart = now()
    remember()
  }
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

  // On and off screen (F5).
  let releaseTimer = 0
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true
    document.documentElement.dataset.heroMark = visible ? 'outline' : 'filled'
    if (visible) {
      clearTimeout(releaseTimer)
      if (!renderer) void restore()
      else wake()
    } else {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      last = 0
      previous = 0
      releaseTimer = window.setTimeout(release, RELEASE_AFTER_MS)
    }
  })
  observer.observe(box)

  async function restore() {
    setState(box, 'loading')
    try {
      await build()
      setState(box, 'live')
      wake()
    } catch {
      giveUp()
    }
  }

  // Back to the poster when motion is reduced, colours are forced or the context is lost.
  const onScheme = () => {
    const next = tokenColours(box)
    uniforms.uInk.value.copy(next.ink)
    uniforms.uAccent.value.copy(next.accent)
    uniforms.uDapi.value.copy(next.dapi)
    uniforms.uDark.value = media.dark.matches ? 1 : 0
    wake()
  }
  const onMotion = () => {
    if (!media.motion.matches || media.forced.matches) giveUp()
  }
  media.dark.addEventListener('change', onScheme)
  media.motion.addEventListener('change', onMotion)
  media.forced.addEventListener('change', onMotion)
  function onLost() {
    lost = true
    if (renderer) giveUp()
  }
  const onResize = () => {
    resize()
    if (renderer) renderer.render(scene, camera)
  }
  const sizeObserver = new ResizeObserver(onResize)
  sizeObserver.observe(box)

  let destroyed = false
  function destroy() {
    if (destroyed) return
    destroyed = true
    if (frame) cancelAnimationFrame(frame)
    clearTimeout(releaseTimer)
    observer.disconnect()
    sizeObserver.disconnect()
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
    delete document.documentElement.dataset.heroMark
  }

  function giveUp() {
    destroy()
    setState(box, 'poster')
  }

  return { destroy }
}
