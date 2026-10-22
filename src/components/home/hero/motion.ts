// The hero's timing (PLAN §10.3), as plain functions of time: the arrival (F2) and the wave to a
// window's label (F3). Our own few lines in place of an animation library (D60); the scene
// (scene.ts) asks them for each frame's values, and the tests check them without a browser.

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
export const easeInOutSine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2

/** The part of a span that has passed at `t`: 0 before `start`, 1 after `start + duration`. */
export const progress = (t: number, start: number, duration: number) =>
  clamp01((t - start) / duration)

/** How long the arrival lasts, in seconds (F2: 0–1.6 s). */
export const INTRO_SECONDS = 1.6

export type IntroFrame = {
  /** 0: the points lie a little inside the brain; 1: each is on its surface. */
  gather: number
  /** How far the calcium wave has run from its cell, as a share of the way across the brain; −1 before. */
  wave: number
  /** How strongly the wave shows: 1 while it runs, fading to 0 as the arrival ends. */
  waveFade: number
  /** The brain's turn about its vertical axis, in radians: from a quarter view to the poster's. */
  turn: number
  /** Whether anything still moves. */
  moving: boolean
}

/**
 * The arrival at `t` seconds after the 3D layer appeared: the points settle in the first second;
 * the wave starts at 0.25 s, crosses the brain in about a second and fades out by 1.6 s, so it
 * reads as one calm sweep and never stops abruptly.
 */
export function introAt(t: number): IntroFrame {
  return {
    gather: easeOutCubic(progress(t, 0, 1)),
    wave: t < 0.25 ? -1 : easeInOutSine(progress(t, 0.25, INTRO_SECONDS - 0.25)) * 1.25,
    waveFade: 1 - progress(t, 1.25, INTRO_SECONDS - 1.25),
    turn: -0.3 * (1 - easeOutCubic(progress(t, 0, INTRO_SECONDS))),
    moving: t < INTRO_SECONDS,
  }
}

/** The arrival's last frame: everything in its place, no wave. */
export const REST: IntroFrame = { gather: 1, wave: -1, waveFade: 0, turn: 0, moving: false }

/** How long the wave takes to reach a label's anchor (F3), in seconds. */
export const FOCUS_SECONDS = 0.4

/**
 * The wave to a label (F3) at `t` seconds after hover or focus began: how far it has run (0–1 of
 * the way to the anchor), then how strongly the anchor glows; after the pointer or focus leaves,
 * the glow fades over 0.3 s (`leftAt`, seconds after the start).
 */
export function focusAt(t: number, leftAt: number | null) {
  const run = easeInOutCubic(progress(t, 0, FOCUS_SECONDS))
  const fade = leftAt === null ? 1 : 1 - progress(t - leftAt, 0, 0.3)
  return { run, strength: fade, moving: fade > 0 && (t < FOCUS_SECONDS || leftAt !== null) }
}

/**
 * Moves `current` towards `target` smoothly, the same at any frame rate: the distance left shrinks
 * by a factor e every 1/rate seconds.
 */
export function follow(current: number, target: number, seconds: number, rate = 8) {
  return target + (current - target) * Math.exp(-rate * seconds)
}
