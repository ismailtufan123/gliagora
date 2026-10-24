import { type Page, type TestInfo, expect } from '@playwright/test'

// Helpers for the pseudo-locale tests (pseudo-locale.spec.ts, PLAN §12, and the states only a
// flow reaches, such as the data-request link's page in data-requests.spec.ts): they run in the
// page.

/**
 * Replaces the page's text in place: every text node (visible text, and text for screen readers
 * such as the names of icon buttons) and every placeholder. Attributes are left alone (the tests
 * find controls by them, and they are not drawn), and so is the lockup, which is the brand in
 * every language (translate="no"). Letters get accented look-alikes, including the Turkish İ, ı,
 * ş and ğ. Each text is marked with [ and ], so a text cut off at either end shows in the
 * screenshots, and grows by 40% in all, the markers included (so by the two markers at least:
 * "Jobs" becomes "[Jöbş]"); the letters added are shared among its words by their length, so
 * long words get longer and lines can still wrap between words. Numbers, email addresses, web
 * addresses and paths stay as they are, as they would in a translation.
 */
export const pseudoLocalise = async (page: Page) => {
  // After hydration (DisclosureEnhancer marks it): React would put back text changed before.
  await page.locator('html[data-js]').waitFor({ state: 'attached' })
  await page.evaluate(() => {
    const ACCENTED: Record<string, string> = {
      a: 'á',
      c: 'ç',
      e: 'é',
      g: 'ğ',
      i: 'ï',
      n: 'ñ',
      o: 'ö',
      s: 'ş',
      u: 'ü',
      y: 'ý',
      A: 'Á',
      C: 'Ç',
      E: 'É',
      G: 'Ğ',
      I: 'İ',
      N: 'Ñ',
      O: 'Ö',
      S: 'Ş',
      U: 'Ü',
      Y: 'Ý',
    }
    const FILL = 'ışğüöçı'
    const KEEP = /^(?:\S*\d\S*|\S+@\S+\.\S+|[a-z][a-z\d+.-]*:\/\/\S*|www\.\S+|\/\S*)$/i
    const translated = (part: string) => /\p{L}/u.test(part) && !KEEP.test(part)
    const letterCount = (part: string) => part.match(/\p{L}/gu)?.length ?? 0
    const pseudo = (text: string) => {
      const [, lead = '', body = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? []
      const parts = body.split(/(\s+)/)
      const letters = parts.filter(translated).reduce((sum, part) => sum + letterCount(part), 0)
      if (!letters) return text
      const extra = Math.max(0, Math.ceil(body.length * 0.4) - 2)
      let seen = 0
      let given = 0
      const result = parts
        .map((part) =>
          translated(part)
            ? part.replace(/\p{L}+/gu, (run) => {
                seen += letterCount(run)
                const add = Math.round((extra * seen) / letters) - given
                given += add
                const accented = [...run].map((letter) => ACCENTED[letter] ?? letter).join('')
                return accented + FILL.repeat(add).slice(0, add)
              })
            : part,
        )
        .join('')
      return `${lead}[${result}]${trail}`
    }
    const skip = (element: Element | null) =>
      !element || !!element.closest('script, style, noscript, template, textarea, [translate="no"]')

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const texts: Text[] = []
    while (walker.nextNode()) texts.push(walker.currentNode as Text)
    for (const text of texts) if (!skip(text.parentElement)) text.data = pseudo(text.data)
    for (const field of document.querySelectorAll<HTMLInputElement>('[placeholder]')) {
      if (!skip(field)) field.placeholder = pseudo(field.placeholder)
    }
  })
}

/** What does not fit: a list of problems, empty when the layout holds. */
export const layoutProblems = (page: Page) =>
  page.evaluate(() => {
    const problems: string[] = []
    const root = document.documentElement
    const describe = (element: Element) =>
      `<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}"> “${(
        element.textContent ?? ''
      )
        .trim()
        .slice(0, 50)}”`
    // Drawn: not in a closed menu (whose content the browser skips), not hidden (such as the page
    // behind the open mobile menu) and not visually hidden (Tailwind's sr-only clips to nothing).
    const drawn = (element: Element) => {
      if (!element.checkVisibility({ visibilityProperty: true })) return false
      for (let node: Element | null = element; node && node !== document.body;) {
        if (getComputedStyle(node).clipPath !== 'none') return false
        node = node.parentElement
      }
      return true
    }

    // The page does not scroll sideways (WCAG 1.4.10). Measured against the width of the layout
    // (the <html> box), not clientWidth, which includes the scrollbar's space that
    // `scrollbar-gutter: stable` keeps (15px where the scrollbar is hidden, as in these tests).
    const width = Math.round(root.getBoundingClientRect().width)
    if (root.scrollWidth > width) {
      problems.push(`the page scrolls sideways: ${root.scrollWidth}px > ${width}px`)
    }

    // Text is neither cut off nor outside its box: in controls, in everything that clips its
    // content, and in layers that stay in place (their overflow does not widen the page, so the
    // check above misses it). Tables scroll sideways in their own box on purpose.
    const CONTROLS =
      'button, summary, .button, .chip, .badge, label, legend, .filter-button, .pagination a, .action-bar, .field-error, .error-summary, .notice'
    for (const element of document.querySelectorAll('body *')) {
      if (!(element instanceof HTMLElement)) continue
      if (element.matches('input, textarea, select, option, .table-scroll')) continue
      const style = getComputedStyle(element)
      if (style.display === 'inline' || style.display === 'contents') continue
      const clips = style.overflowX !== 'visible' || style.textOverflow !== 'clip'
      const fixed = style.position === 'fixed' || style.position === 'sticky'
      if (!clips && !fixed && !element.matches(CONTROLS)) continue
      if (!drawn(element)) continue
      if (element.scrollWidth > element.clientWidth + 1) {
        problems.push(
          `cut off or sticking out (${element.scrollWidth}px > ${element.clientWidth}px): ${describe(element)}`,
        )
      }
      const box = element.getBoundingClientRect()
      if (fixed && (box.left < -1 || box.right > width + 1)) {
        problems.push(`outside the screen: ${describe(element)}`)
      }
    }

    // The header keeps its height: what it shows stays inside it (menus open below it).
    const header = document.querySelector('.site-header')
    if (header) {
      const bounds = header.getBoundingClientRect()
      for (const element of header.querySelectorAll('.page-frame *')) {
        if (element.closest('.menu-panel, .mobile-panel, dialog') || !drawn(element)) continue
        const box = element.getBoundingClientRect()
        if (box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1) {
          problems.push(`taller than the header: ${describe(element)}`)
        }
      }
    }
    return problems
  })

/**
 * Focuses each control of the Tab order in turn, which scrolls it into view as Tab does, and
 * lists those whose middle is then under the sticky header or the job page's fixed action bar
 * (WCAG 2.4.7; 2.4.11 in WCAG 2.2). It walks forward from the top of the page, as Tab does, and
 * then backward from its end, as Shift+Tab does: the browser scrolls only to a control outside
 * the screen, so a forward walk brings each one in at the bottom, and one left under the header
 * shows only going backward (or where the layout moves focus up the screen, such as from one
 * footer column to the next). Controls that cannot take focus now (inert behind a dialog, in a
 * closed menu) are skipped. Run it last: moving focus closes open menus and popovers.
 */
export const hiddenWhenFocused = (page: Page) =>
  page.evaluate(() => {
    const hidden: string[] = []
    const layers = [...document.querySelectorAll('.site-header, .action-bar')]
    const FOCUSABLE =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'
    // Out of the Tab order, such as the forms' hidden field for spam programs.
    const controls = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (control) => control.tabIndex >= 0,
    )
    const check = (control: HTMLElement, walk: string) => {
      control.focus()
      if (document.activeElement !== control) return
      const box = control.getBoundingClientRect()
      // The middle of its part on the screen: a control taller than the screen (a table that
      // scrolls in its own box) is partly off it.
      const top = Math.max(box.top, 0)
      const bottom = Math.min(box.bottom, window.innerHeight)
      const left = Math.max(box.left, 0)
      const right = Math.min(box.right, window.innerWidth)
      if (bottom <= top || right <= left) return
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
      if (hit && layers.some((layer) => layer.contains(hit) && !layer.contains(control))) {
        hidden.push(
          `${walk}: ${control.outerHTML.slice(0, 100)} under ${hit.outerHTML.slice(0, 60)}`,
        )
      }
    }
    for (const control of controls) check(control, 'Tab')
    window.scrollTo(0, document.documentElement.scrollHeight)
    for (const control of [...controls].reverse()) check(control, 'Shift+Tab')
    ;(document.activeElement as HTMLElement | null)?.blur()
    return hidden
  })

/** Pseudo-localises the page as it is now, attaches a screenshot and checks the layout. */
export async function expectLayoutHolds(
  page: Page,
  testInfo: TestInfo,
  state: string,
  { modal = false }: { modal?: boolean } = {},
) {
  await pseudoLocalise(page)
  // Measured in the web fonts, as people see the page, and once transitions have ended (a chevron
  // turning as its menu opens sticks out of its button while it turns).
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  const { width, height } = page.viewportSize()!
  // A dialog or menu that covers the screen is shown as the screen is; other states in full.
  await testInfo.attach(`${state} at ${width}×${height}`, {
    body: await screenshot(page, !modal),
    contentType: 'image/png',
  })
  expect(await layoutProblems(page), state).toEqual([])
  expect(await hiddenWhenFocused(page), state).toEqual([])
}

/**
 * The test browser draws WebGL in software, and when a page is closed while the home page's 3D
 * hero is still being built there, the next screenshot in the same browser can fail once ("Unable
 * to capture screenshot"); a second try a moment later works. So it tries up to three times.
 */
async function screenshot(page: Page, fullPage: boolean) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.screenshot({ fullPage })
    } catch (error) {
      if (attempt === 3 || !String(error).includes('Unable to capture screenshot')) throw error
      await page.waitForTimeout(250)
    }
  }
}
