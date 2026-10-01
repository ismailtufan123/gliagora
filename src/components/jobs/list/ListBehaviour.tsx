'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'

import {
  DEADLINE_FROM,
  DEADLINE_RANGE,
  DEADLINE_TO,
  JOB_FILTERS,
  jobFormValues,
} from '@/lib/filters/jobs'
import { filtersHref, parseFilters } from '@/lib/filters/model'
import { deadlineRange } from '@/lib/filters/values'
import { LOCATION_CHANGE } from '@/lib/link-state'

import { type TakeOver, plainClick } from './handoff'

import { FILTER_FORM_ID, RANGE_ERROR_ID, RESULTS_HEADING_ID, RESULTS_ID } from './ids'

// Loaded by JobsListEnhancer when the reader first reaches for the list's controls, which hands
// over what they did in the moment before it arrived (`takeOver`).
//
// The jobs list without page loads (PLAN §17.4): a ticked box, a chosen option or the sort order
// applies at once. The form's values become the canonical address (src/lib/filters) and the
// router fetches the list for it inside a transition, so the page stays usable, focus stays where
// it was, and the results are marked busy until the new ones arrive; the count above them is a
// live region, so the new number is announced. Chips, "Clear all" and the empty state's links
// (a[data-soft]) change the list the same way. Without JavaScript the form and links load pages.
// Also: the date fields choose "Between these dates", and Apply with a day missing or in the
// wrong order shows an error by them instead of applying; arrow keys in the deadline options only
// move the choice (they would apply every option they pass), Enter or Apply applies it; "Show 38
// positions" closes the filter sheet; long lists narrow as one types in their search box.

/** Case- and accent-insensitive text, for the search boxes of long lists. */
const fold = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

/** The fields of "Between these dates", and whether they are chosen with days that make no range. */
function rangeOf(form: HTMLFormElement) {
  const option = form.querySelector<HTMLInputElement>(
    `[name="deadline"][value="${DEADLINE_RANGE}"]`,
  )
  const days = [DEADLINE_FROM, DEADLINE_TO].map((name) => form.elements.namedItem(name))
  const [from, to] = days.filter((day) => day instanceof HTMLInputElement)
  const invalid = !!option?.checked && !deadlineRange(from?.value, to?.value)
  return { option, from, to, invalid }
}

/** Shows or hides the range's error, tied to both date fields while it shows. */
function showRangeError(form: HTMLFormElement, show: boolean) {
  const error = document.getElementById(RANGE_ERROR_ID)
  if (!error) return
  error.hidden = !show
  const { from, to } = rangeOf(form)
  for (const day of [from, to]) {
    if (show) {
      day?.setAttribute('aria-invalid', 'true')
      day?.setAttribute('aria-describedby', RANGE_ERROR_ID)
    } else {
      day?.removeAttribute('aria-invalid')
      day?.removeAttribute('aria-describedby')
    }
  }
}

export default function ListBehaviour({ query, takeOver }: { query: string; takeOver: TakeOver }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // The link that started a change, and its place among the chips.
  const clicked = useRef<{ link: Element; chip: number } | null>(null)
  // Where focus was when the change started.
  const focused = useRef<Element | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    const form = document.getElementById(FILTER_FORM_ID)
    if (!(form instanceof HTMLFormElement)) return
    const go = (href: string) => {
      if (href === location.pathname + location.search) return
      focused.current = document.activeElement
      startTransition(() => router.push(href, { scroll: false }))
    }
    const formHref = () =>
      filtersHref(
        JOB_FILTERS,
        parseFilters(JOB_FILTERS, new URLSearchParams(new FormData(form) as unknown as string[][])),
      )

    // Arrow keys check each option of a radio group they pass: those wait for Enter or Apply.
    // `change` comes between keydown and keyup, also for a held key.
    let arrowKey = false
    const onKeyDown = (event: KeyboardEvent) => {
      arrowKey = event.key.startsWith('Arrow')
    }
    const onKeyUp = () => {
      arrowKey = false
    }

    // Changes the reader made before this script arrived (below): the form already shows them, so
    // they apply together, once, rather than one by one from a form that has moved on.
    let keptChanges: { apply: boolean; later: Event[] } | null = null

    // On the document: the sort order belongs to the form (form="…") but sits outside it.
    // `arrow`: whether an arrow key made the change (one that came before this script did).
    const onChange = (event: Event, arrow = arrowKey) => {
      const field = event.target as HTMLInputElement
      if (field.form !== form) return
      const day = field.name === DEADLINE_FROM || field.name === DEADLINE_TO
      const { option } = rangeOf(form)
      // A day checks "Between these dates", unless a deadline option was chosen after it.
      const overridden = keptChanges?.later.some(
        (next) => (next.target as HTMLInputElement).name === 'deadline',
      )
      if (day && option && !overridden) option.checked = true
      // The range's error goes once the days are right or another option is chosen.
      if ((day || field.name === 'deadline') && !rangeOf(form).invalid) showRangeError(form, false)
      // The range applies with Apply, once both days are there.
      if (day || field.value === DEADLINE_RANGE) return
      if (field.type === 'radio' && arrow) return
      if (!field.name || field.type === 'search') return
      if (keptChanges) keptChanges.apply = true
      else go(formHref())
    }

    const onSubmit = (event: SubmitEvent) => {
      event.preventDefault()
      const range = rangeOf(form)
      if (range.invalid && range.from && range.to) {
        // Not applied: the error shows by the date fields (opened if they were closed), and focus
        // moves to the day to fix. Unless they cannot be shown (in the closed filter sheet): then
        // the rest applies, as the range was never applied.
        const deadline = range.from.closest('details')
        if (deadline) deadline.open = true
        if (!range.from.checkVisibility || range.from.checkVisibility()) {
          showRangeError(form, true)
          ;(range.from.value ? range.to : range.from).focus()
          return
        }
      }
      go(formHref())
      if (event.submitter?.hasAttribute('data-close-sheet')) {
        form.querySelector<HTMLElement>('.filter-sheet [data-disclosure-close]')?.click()
      }
    }

    const onInput = (event: Event) => {
      const box = event.target as HTMLInputElement
      if (!box.hasAttribute('data-list-search')) return
      const list = document.getElementById(box.getAttribute('aria-controls') ?? '')
      const words = fold(box.value.trim())
      for (const item of list?.querySelectorAll('li') ?? []) {
        item.hidden = !fold(item.textContent ?? '').includes(words)
      }
      for (const group of list?.querySelectorAll('fieldset') ?? []) {
        group.hidden = !group.querySelector('li:not([hidden])')
      }
    }

    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element && event.target.closest('a[data-soft]')
      if (!link || !plainClick(event)) return
      event.preventDefault()
      clicked.current = { link, chip: [...document.querySelectorAll('[data-chip]')].indexOf(link) }
      go(link.getAttribute('href') ?? JOB_FILTERS.path)
    }

    document.addEventListener('change', onChange)
    form.addEventListener('keydown', onKeyDown)
    form.addEventListener('keyup', onKeyUp)
    form.addEventListener('submit', onSubmit)
    form.addEventListener('input', onInput)
    document.addEventListener('click', onClick)
    // From here on the listeners above answer; then what came before them is done, in order.
    const kept = takeOver()
    for (const [index, { event, arrowKey: arrow }] of kept.entries()) {
      if (event.type === 'change') {
        keptChanges ??= { apply: false, later: [] }
        keptChanges.later = kept
          .slice(index + 1)
          .flatMap((next) => (next.event.type === 'change' ? [next.event] : []))
        onChange(event, arrow)
        continue
      }
      if (event.type === 'input') {
        onInput(event)
        continue
      }
      // A submitted form or a clicked link goes where it leads, after the changes before it.
      const changes = keptChanges as { apply: boolean } | null
      keptChanges = null
      if (changes?.apply) go(formHref())
      if (event.type === 'submit') onSubmit(event as SubmitEvent)
      else if (event.type === 'click') onClick(event as MouseEvent)
    }
    const changes = keptChanges as { apply: boolean } | null
    if (changes?.apply) go(formHref())
    keptChanges = null
    return () => {
      document.removeEventListener('change', onChange)
      form.removeEventListener('keydown', onKeyDown)
      form.removeEventListener('keyup', onKeyUp)
      form.removeEventListener('submit', onSubmit)
      form.removeEventListener('input', onInput)
      document.removeEventListener('click', onClick)
    }
  }, [router, takeOver])

  useEffect(() => {
    document.getElementById(RESULTS_ID)?.setAttribute('aria-busy', String(pending))
    // Once the list for the new address has arrived, the form shows exactly its filters: a box
    // the reader ticked stays ticked in the page even after its chip removed it.
    if (pending || !mounted.current) {
      mounted.current = true
      return
    }
    // The header marks the menu entry of the current list ("PhD") as the current page.
    window.dispatchEvent(new Event(LOCATION_CHANGE))
    const form = document.getElementById(FILTER_FORM_ID)
    if (!(form instanceof HTMLFormElement)) return
    const values = jobFormValues(parseFilters(JOB_FILTERS, new URLSearchParams(query)))
    showRangeError(form, false)
    for (const field of form.elements) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) continue
      const chosen = values[field.name]
      if (!chosen) continue
      if (field.type === 'checkbox' || field.type === 'radio') {
        ;(field as HTMLInputElement).checked = chosen.includes(field.value)
      } else if (field !== document.activeElement) {
        field.value = chosen[0] ?? ''
      }
    }
    // A removed chip took focus with it: move on to the next chip, or to the results.
    const from = clicked.current
    clicked.current = null
    if (from && !from.link.isConnected) {
      const chips = document.querySelectorAll<HTMLElement>('[data-chip]')
      const next = chips[from.chip] ?? chips[from.chip - 1]
      ;(next ?? document.getElementById(RESULTS_HEADING_ID))?.focus()
    }
    // A filter the server had opened to show an error closes with the new list: focus inside it
    // moves to its button rather than get lost.
    const before = focused.current
    focused.current = null
    const active = document.activeElement
    if (
      before?.isConnected &&
      (active === before || active === document.body) &&
      before.checkVisibility?.() === false
    ) {
      before.closest('details:not([open])')?.querySelector<HTMLElement>(':scope > summary')?.focus()
    }
  }, [query, pending])

  return null
}
