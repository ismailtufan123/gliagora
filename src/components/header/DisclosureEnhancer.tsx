'use client'

import { useEffect } from 'react'

// The header menus are <details data-disclosure> elements, so they open and close without
// JavaScript (CSS hides the page behind the open mobile menu, see global.css). This adds what
// the disclosure pattern needs on top (PLAN §7.5):
// - only one menu is open at a time (a menu inside an open menu keeps its parent open);
// - Esc closes the innermost open menu and returns focus to its button;
// - a click or focus outside an open menu closes it;
// - a menu marked data-modal (the mobile menu) makes the rest of the page inert while open and
//   moves focus to its first item; its sub-menus close only when another one opens;
// - when the window crosses the desktop breakpoint, menus that are no longer shown close, and
//   focus inside them moves to the visible navigation instead of getting lost.

const SELECTOR = 'details[data-disclosure]'
const MODAL = 'details[data-modal]'

function openMenus() {
  return [...document.querySelectorAll<HTMLDetailsElement>(`${SELECTOR}[open]`)]
}

const summaryOf = (menu: Element) => menu.querySelector<HTMLElement>(':scope > summary')

function close(menu: HTMLDetailsElement, returnFocus: boolean) {
  menu.open = false
  // The button is always in view (the header is sticky), so the page must not scroll.
  if (returnFocus) summaryOf(menu)?.focus({ preventScroll: true })
}

function setModal(menu: HTMLDetailsElement, on: boolean) {
  const keep = menu.closest('header')
  for (const element of document.body.children) {
    if (element !== keep && element instanceof HTMLElement) element.inert = on
  }
  if (on) menu.querySelector<HTMLElement>(':scope > :not(summary) :is(a, summary)')?.focus()
}

export function DisclosureEnhancer({ desktopQuery }: { desktopQuery: string }) {
  useEffect(() => {
    const onToggle = (event: Event) => {
      const menu = event.target
      if (!(menu instanceof HTMLDetailsElement) || !menu.matches(SELECTOR)) return
      if (menu.open) {
        let closedOther = false
        for (const other of openMenus()) {
          if (other !== menu && !other.contains(menu)) {
            close(other, false)
            closedOther = true
          }
        }
        // Closing a sub-menu above this one moves it up; keep its button in view.
        if (closedOther && menu.closest(MODAL) !== menu) {
          summaryOf(menu)?.scrollIntoView({ block: 'nearest' })
        }
      }
      if (menu.matches(MODAL)) setModal(menu, menu.open)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const menus = openMenus()
      const active = document.activeElement
      const innermost =
        menus.filter((menu) => active && menu.contains(active)).pop() ?? menus.at(-1)
      if (innermost) {
        event.preventDefault()
        close(innermost, true)
      }
    }

    // Menus inside the mobile menu are left alone here: collapsing one while focus moves on
    // would shift the item that just received focus out of view.
    const onOutside = (event: Event) => {
      const target = event.target
      if (!(target instanceof Node)) return
      for (const menu of openMenus()) {
        if (menu.contains(target) || menu.matches(MODAL) || menu.parentElement?.closest(MODAL)) {
          continue
        }
        close(menu, false)
      }
    }

    // When the layout changes, the browser drops focus from an element it hides before the
    // media query reports the change, so remember where focus last was.
    let lastFocused: Element | null = null
    const onFocusIn = (event: FocusEvent) => {
      lastFocused = event.target instanceof Element ? event.target : null
    }

    const desktop = window.matchMedia(desktopQuery)
    const onBreakpoint = () => {
      const active =
        document.activeElement && document.activeElement !== document.body
          ? document.activeElement
          : lastFocused
      // Menus that the new layout hides: the mobile menu on desktop, desktop menus below it.
      const hidden = openMenus().filter((menu) =>
        desktop.matches ? menu.matches(MODAL) : !menu.closest(MODAL),
      )
      const hadFocus = hidden.some((menu) => active && menu.contains(active))
      for (const menu of hidden) close(menu, false)
      if (!hadFocus) return
      const target = desktop.matches
        ? document.querySelector<HTMLElement>('.site-header nav a')
        : document.querySelector<HTMLElement>(`${MODAL} > summary`)
      target?.focus()
    }

    document.addEventListener('toggle', onToggle, true)
    document.addEventListener('keydown', onKeyDown)
    // pointerdown rather than click: iOS Safari sends no click for taps on plain content.
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('focusin', onOutside)
    document.addEventListener('focusin', onFocusIn)
    desktop.addEventListener('change', onBreakpoint)

    // A menu opened before the page became interactive: keep only the last one open and apply
    // the mobile menu's settings.
    const alreadyOpen = openMenus().filter((menu) => !menu.parentElement?.closest(MODAL))
    for (const menu of alreadyOpen.slice(0, -1)) close(menu, false)
    const open = alreadyOpen.at(-1)
    if (open?.matches(MODAL)) setModal(open, true)

    return () => {
      document.removeEventListener('toggle', onToggle, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('focusin', onOutside)
      document.removeEventListener('focusin', onFocusIn)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [desktopQuery])

  return null
}
