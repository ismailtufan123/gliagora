import type { Page } from '@playwright/test'

// Helpers for the reflow checks (layout.spec.ts, and the states only a flow reaches, such as the
// data-request link's page in data-requests.spec.ts; PLAN §17.1): WCAG 1.4.10 at 320px, with the
// text spacing of WCAG 1.4.12 and with text at 200% (WCAG 1.4.4).

/** WCAG 1.4.12: the text spacing a person may set. */
export const TEXT_SPACING =
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'

// Text at 200%: everything is sized in rem, so doubling the root size doubles all text. Media
// queries still see a 320px screen (they are measured in the browser's default size), which is
// harder than zooming the page; container queries see the new size (the header's lockup,
// global.css).
export const TEXT_200 = 'html { font-size: 200% !important; }'

/**
 * How far the page scrolls sideways: its content against the width of the layout (the <html>
 * box). Not against clientWidth, which includes the scrollbar's space that
 * `scrollbar-gutter: stable` keeps (15px where the scrollbar is hidden, as in these tests).
 */
export const sidewaysScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      Math.round(document.documentElement.getBoundingClientRect().width),
  )
