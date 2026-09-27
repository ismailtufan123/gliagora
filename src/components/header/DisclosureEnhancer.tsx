'use client'

import { useEffect } from 'react'

// The header menus are <details data-disclosure> elements, so they open and close without
// JavaScript. This adds what the disclosure pattern needs on top (PLAN §7.5):
// - only one menu is open at a time (a menu inside an open menu keeps its parent open);
// - Esc closes the innermost open menu and returns focus to its button;
// - a click or focus outside an open menu closes it;
// - a menu marked data-modal (the mobile menu) makes the rest of the page inert while open,
//   moves focus to its first link, stops the page behind it from scrolling, and closes when
//   the window becomes wide enough for the desktop navigation.

const SELECTOR = 'details[data-disclosure]'

function openMenus() {
  return [...document.querySelectorAll<HTMLDetailsElement>(`${SELECTOR}[open]`)]
}

function close(menu: HTMLDetailsElement, returnFocus: boolean) {
  menu.open = false
  if (returnFocus) menu.querySelector<HTMLElement>(':scope > summary')?.focus()
}

function setModal(menu: HTMLDetailsElement, on: boolean) {
  const keep = menu.closest('header')
  for (const element of document.body.children) {
    if (element !== keep && element instanceof HTMLElement) element.inert = on
  }
  document.documentElement.classList.toggle('scroll-locked', on)
  if (on) menu.querySelector<HTMLElement>(':scope > :not(summary) :is(a, summary)')?.focus()
}

export function DisclosureEnhancer({ desktopQuery }: { desktopQuery: string }) {
  useEffect(() => {
    const onToggle = (event: Event) => {
      const menu = event.target
      if (!(menu instanceof HTMLDetailsElement) || !menu.matches(SELECTOR)) return
      if (menu.open) {
        for (const other of openMenus()) {
          if (other !== menu && !other.contains(menu)) close(other, false)
        }
      }
      if (menu.hasAttribute('data-modal')) setModal(menu, menu.open)
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

    const onOutside = (event: Event) => {
      const target = event.target
      if (!(target instanceof Node)) return
      for (const menu of openMenus()) {
        if (!menu.contains(target) && !menu.hasAttribute('data-modal')) close(menu, false)
      }
    }

    const desktop = window.matchMedia(desktopQuery)
    const onResize = () => {
      if (!desktop.matches) return
      for (const menu of openMenus()) if (menu.hasAttribute('data-modal')) close(menu, false)
    }

    document.addEventListener('toggle', onToggle, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onOutside)
    document.addEventListener('focusin', onOutside)
    desktop.addEventListener('change', onResize)
    return () => {
      document.removeEventListener('toggle', onToggle, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onOutside)
      document.removeEventListener('focusin', onOutside)
      desktop.removeEventListener('change', onResize)
    }
  }, [desktopQuery])

  return null
}
