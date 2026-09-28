'use client'

import { useEffect } from 'react'

// Menus are <details data-disclosure> elements, so they open and close without JavaScript (CSS
// hides the page behind the open mobile menu, see global.css). This adds what the disclosure
// pattern needs on top (PLAN §7.5), for the header menus and for other disclosures on a page,
// such as the jobs filters:
// - only one menu is open at a time (a menu inside an open menu keeps its parent open);
// - Esc closes the innermost open menu and returns focus to its button;
// - a click or focus outside an open menu closes it;
// - a menu marked data-modal makes the rest of the page inert while open and moves focus to its
//   first item; its sub-menus close only when another one opens. In the header (the mobile menu)
//   the header stays usable, since the menu's button closes it. Elsewhere (the filter sheet) the
//   panel covers its own button: the button is inert too, the panel becomes a modal dialog, and a
//   [data-disclosure-close] button inside it closes it. Such a sheet opened before JavaScript ran
//   stays in the page (data-inline) until it is closed. Should the menu leave the page while open
//   (no toggle event says so), the rest of the page is released;
// - when the window crosses the desktop breakpoint, menus that are no longer shown close, and
//   focus inside them moves to what is shown instead of getting lost;
// - <html data-js> tells CSS that JavaScript runs, for controls that need it.

const SELECTOR = 'details[data-disclosure]'
const MODAL = 'details[data-modal]'

function openMenus() {
  return [...document.querySelectorAll<HTMLDetailsElement>(`${SELECTOR}[open]`)]
}

const summaryOf = (menu: Element) => menu.querySelector<HTMLElement>(':scope > summary')

function close(menu: HTMLDetailsElement, returnFocus: boolean) {
  menu.open = false
  const summary = summaryOf(menu)
  if (!summary) return
  // A sheet's button was inert while the sheet covered it.
  summary.inert = false
  // Header buttons are always in view (the header is sticky), so the page must not scroll.
  if (returnFocus) summary.focus({ preventScroll: !!menu.closest('header') })
}

// The open modal menu, the elements it made inert, and what watches for it to leave the page:
// the jobs list's error state replaces the filter sheet, going back or forward replaces the page.
let modal: { menu: HTMLDetailsElement; inert: HTMLElement[]; watch: MutationObserver } | null = null

function releaseModal() {
  if (!modal) return
  modal.watch.disconnect()
  for (const element of modal.inert) element.inert = false
  modal = null
}

function setModal(menu: HTMLDetailsElement, on: boolean) {
  if (on || modal?.menu === menu) releaseModal()
  const keep = menu.closest('header') ?? menu
  if (on) {
    const inert: HTMLElement[] = []
    for (let node: Element = keep; node !== document.body && node.parentElement;) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) {
          sibling.inert = true
          inert.push(sibling)
        }
      }
      node = node.parentElement
    }
    const watch = new MutationObserver(() => {
      if (!menu.isConnected) releaseModal()
    })
    watch.observe(document.body, { childList: true, subtree: true })
    modal = { menu, inert, watch }
  }
  if (keep === menu) {
    const summary = summaryOf(menu)
    const panel = menu.querySelector(':scope > :not(summary)')
    if (summary) summary.inert = on
    // A named group while it is part of the page (the filter bar), a dialog while it is a sheet.
    panel?.setAttribute('role', on ? 'dialog' : 'group')
    if (on) panel?.setAttribute('aria-modal', 'true')
    else panel?.removeAttribute('aria-modal')
  }
  if (on) menu.querySelector<HTMLElement>(':scope > :not(summary) :is(a, summary, button)')?.focus()
}

export function DisclosureEnhancer({ desktopQuery }: { desktopQuery: string }) {
  useEffect(() => {
    document.documentElement.dataset.js = ''

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
      if (menu.matches(MODAL)) {
        if (!menu.open) delete menu.dataset.inline
        else if (menu.hasAttribute('data-inline')) return
        setModal(menu, menu.open)
      }
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

    // Menus inside an open modal menu are left alone here: collapsing one while focus moves on
    // would shift the item that just received focus out of view.
    const onOutside = (event: Event) => {
      const target = event.target
      if (!(target instanceof Node)) return
      for (const menu of openMenus()) {
        if (
          menu.contains(target) ||
          menu.matches(MODAL) ||
          menu.parentElement?.closest(`${MODAL}[open]`)
        ) {
          continue
        }
        close(menu, false)
      }
    }

    const onClick = (event: MouseEvent) => {
      const button =
        event.target instanceof Element && event.target.closest('[data-disclosure-close]')
      const menu = button && button.closest<HTMLDetailsElement>(SELECTOR)
      if (menu) close(menu, true)
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
      // Menus that the new layout hides. On desktop: the modal menus (mobile menu, filter sheet)
      // and what is open inside them. Below it: the desktop menus, and menus inside a closed
      // modal (the filter bar's popovers, which the sheet holds).
      const hidden = openMenus().filter((menu) => {
        const modal = menu.closest<HTMLDetailsElement>(MODAL)
        return desktop.matches ? !!modal : !modal || (modal !== menu && !modal.open)
      })
      const focused = hidden.find((menu) => active && menu.contains(active))
      for (const menu of hidden) close(menu, false)
      if (!focused) return
      const modal = focused.closest(MODAL)
      const target = desktop.matches
        ? modal?.closest('header')
          ? document.querySelector<HTMLElement>('.site-header nav a')
          : modal?.querySelector<HTMLElement>(':scope > :not(summary) summary')
        : modal
          ? summaryOf(modal)
          : document.querySelector<HTMLElement>(`.site-header ${MODAL} > summary`)
      target?.focus()
    }

    document.addEventListener('toggle', onToggle, true)
    document.addEventListener('keydown', onKeyDown)
    // pointerdown rather than click: iOS Safari sends no click for taps on plain content.
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('focusin', onOutside)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('click', onClick)
    desktop.addEventListener('change', onBreakpoint)

    // A menu opened before the page became interactive: keep only the last one open and apply
    // the modal menu's settings. Not to a sheet in the page, though: it lies in the page's flow
    // without JavaScript, and turning it into an overlay now would move the page with nothing the
    // reader did to explain it (a layout shift). It stays in the page until it is closed. The
    // header's menu covers the page without JavaScript too.
    const alreadyOpen = openMenus().filter((menu) => !menu.parentElement?.closest(MODAL))
    for (const menu of alreadyOpen.slice(0, -1)) close(menu, false)
    const open = alreadyOpen.at(-1)
    if (open?.matches(MODAL)) {
      if (open.closest('header')) setModal(open, true)
      else open.dataset.inline = ''
    }

    return () => {
      document.removeEventListener('toggle', onToggle, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onOutside)
      document.removeEventListener('focusin', onOutside)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('click', onClick)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [desktopQuery])

  return null
}
