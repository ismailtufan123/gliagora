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
// It also opens the search dialog (PLAN §2.3, §7.5; SearchDialog.tsx) from Ctrl+K (⌘K on Apple
// devices, <html data-apple>) and from the header's Search link, which leads to the search page
// without JavaScript. Only the opening is here: the rest of the dialog's code loads on first use
// (search-dialog.ts), so every page carries a few hundred bytes for search (PLAN §17.3). Where a
// page has no search dialog (the M2 state's reduced header, D41), the shortcut stays the
// browser's.
// Likewise for Save (src/components/account/SaveControl.tsx): a Save form submitted here is taken
// over, and its code loads on first use (save-toggle.ts), or already when focus reaches a Save
// form; should it fail to load, the form is sent as it would be without JavaScript.

const SELECTOR = 'details[data-disclosure]'
const MODAL = 'details[data-modal]'

function openMenus() {
  return [...document.querySelectorAll<HTMLDetailsElement>(`${SELECTOR}[open]`)]
}

const summaryOf = (menu: Element) => menu.querySelector<HTMLElement>(':scope > summary')

function searchDialog() {
  const dialog = document.getElementById('search-dialog')
  return dialog instanceof HTMLDialogElement ? dialog : null
}

function openSearch(from: Element | null) {
  const dialog = searchDialog()
  if (!dialog || dialog.open) return
  // Focuses the search field, its first control; Esc closes it and the browser returns focus.
  dialog.showModal()
  void import('./search-dialog').then((module) => module.enhance(dialog, from))
}

const SAVE_FORM = 'form[data-save]'
const saveModule = () => import('./save-toggle')

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
  // Its first item that is shown (the menu's search link shows only on the narrowest screens).
  if (on) {
    const items = [
      ...menu.querySelectorAll<HTMLElement>(':scope > :not(summary) :is(a, summary, button)'),
    ]
    items.find((item) => item.getClientRects().length)?.focus()
  }
}

export function DisclosureEnhancer({ desktopQuery }: { desktopQuery: string }) {
  useEffect(() => {
    document.documentElement.dataset.js = ''
    // ⌘ on Apple devices, where Ctrl+K edits text; Ctrl elsewhere.
    const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    if (apple) document.documentElement.dataset.apple = ''
    for (const link of document.querySelectorAll('[data-search-open]')) {
      link.setAttribute('aria-haspopup', 'dialog')
      link.setAttribute('aria-keyshortcuts', apple ? 'Meta+K' : 'Control+K')
    }

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
      if (
        (event.key === 'k' || event.key === 'K') &&
        (apple ? event.metaKey : event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        searchDialog()
      ) {
        event.preventDefault()
        openSearch(document.activeElement)
        return
      }
      // An open dialog closes itself on Esc.
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return
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
      // The search dialog opens over the page: menus under it stay open, so that the browser can
      // return focus to the item that opened it when it closes (a press on its backdrop targets
      // the dialog too).
      if (target instanceof Element && target.closest('dialog[open]')) return
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
      const target = event.target instanceof Element ? event.target : null
      const search = target?.closest('[data-search-open]')
      // A plain click; with a modifier the link opens the search page in a new tab or window.
      if (
        search &&
        !event.button &&
        !(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      ) {
        event.preventDefault()
        openSearch(search)
        return
      }
      const menu = target?.closest('[data-disclosure-close]')?.closest<HTMLDetailsElement>(SELECTOR)
      if (menu) close(menu, true)
    }

    // When the layout changes, the browser drops focus from an element it hides before the
    // media query reports the change, so remember where focus last was.
    let lastFocused: Element | null = null
    const onFocusIn = (event: FocusEvent) => {
      lastFocused = event.target instanceof Element ? event.target : null
      if (lastFocused?.closest(SAVE_FORM)) saveModule().catch(() => {})
    }

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target
      if (!(form instanceof HTMLFormElement) || !form.matches(SAVE_FORM)) return
      event.preventDefault()
      saveModule().then(
        (module) => module.toggle(form),
        () => form.submit(),
      )
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
      // The reduced header (M2) has no navigation: its first link, the lockup, then.
      const target = desktop.matches
        ? modal?.closest('header')
          ? (document.querySelector<HTMLElement>('.site-header nav a') ??
            document.querySelector<HTMLElement>('.site-header a'))
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
    document.addEventListener('submit', onSubmit)
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
      document.removeEventListener('submit', onSubmit)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [desktopQuery])

  return null
}
