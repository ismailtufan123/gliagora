'use client'

import { Suspense, lazy, useEffect, useState } from 'react'

import { type TakeOver, type Waiting, plainClick } from './handoff'
import { FILTER_FORM_ID } from './ids'

// The jobs list without page loads (ListBehaviour: filters, chips and the sort order apply at
// once) loads when the reader first reaches for them: the pointer over them, focus in them, or
// their first use. Until then the page carries only this (PLAN §17.3, D45). What the reader does
// in the moment before it arrives is kept: a field changed, typing in a list's search box, the
// form submitted or a chip or other a[data-soft] link clicked, which would otherwise load a page.
// ListBehaviour then does them in order. Without JavaScript the form and links load pages.

let loaded = false
const ListBehaviour = lazy(() =>
  import('./ListBehaviour').then((module) => {
    loaded = true
    return module
  }),
)

const nothingKept: TakeOver = () => []

export function JobsListEnhancer({ query }: { query: string }) {
  // Once loaded (an earlier visit to the list in this tab), it comes back at once, with nothing
  // to hand over.
  const [takeOver, setTakeOver] = useState<TakeOver | null>(() => (loaded ? nothingKept : null))
  const [startedLoaded] = useState(() => loaded)

  useEffect(() => {
    const form = document.getElementById(FILTER_FORM_ID)
    if (startedLoaded || !(form instanceof HTMLFormElement)) return
    const waiting: Waiting[] = []
    let taken = false
    let arrowKey = false
    const handOver: TakeOver = () => {
      taken = true
      return waiting.splice(0)
    }
    const ours = (target: EventTarget | null) =>
      target instanceof Element &&
      (form.contains(target) ||
        (target as HTMLInputElement).form === form ||
        !!target.closest('a[data-soft]'))

    const wake = (event: Event) => {
      if (taken || !ours(event.target)) return
      setTakeOver(() => handOver)
      if (event.type === 'keydown') arrowKey = (event as KeyboardEvent).key.startsWith('Arrow')
      if (event.type === 'keyup') arrowKey = false
    }
    const keep = (event: Event) => {
      if (taken || !ours(event.target)) return
      if (event.type === 'click') {
        if (!plainClick(event as MouseEvent) || !(event.target as Element).closest('a[data-soft]'))
          return
        event.preventDefault()
      }
      if (event.type === 'submit') event.preventDefault()
      waiting.push({ event, arrowKey })
      setTakeOver(() => handOver)
    }

    const early = ['pointerover', 'focusin', 'keydown', 'keyup']
    const acts = ['change', 'input', 'submit', 'click']
    for (const type of early) document.addEventListener(type, wake)
    for (const type of acts) document.addEventListener(type, keep)
    return () => {
      for (const type of early) document.removeEventListener(type, wake)
      for (const type of acts) document.removeEventListener(type, keep)
    }
  }, [startedLoaded])

  return takeOver ? (
    <Suspense fallback={null}>
      <ListBehaviour query={query} takeOver={takeOver} />
    </Suspense>
  ) : null
}
