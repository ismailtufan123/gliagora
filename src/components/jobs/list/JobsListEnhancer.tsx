'use client'

import { type ComponentType, useEffect, useState } from 'react'

import { type TakeOver, type Waiting, plainClick } from './handoff'
import { FILTER_FORM_ID } from './ids'

// The jobs list without page loads (ListBehaviour: filters, chips and the sort order apply at
// once) loads when the reader first reaches for them: the pointer over them, focus in them, or
// their first use. Until then the page carries only this (PLAN §17.3, D45). What the reader does
// in the moment before it arrives is kept: a field changed, typing in a list's search box, the
// form submitted or a chip or other a[data-soft] link clicked, which would otherwise load a page.
// ListBehaviour then does it. Without JavaScript the form and links load pages; so does the page
// when ListBehaviour cannot be loaded (a broken connection, or a version of the site deployed
// since the page was loaded, whose files have other names): the kept action then loads its page.

type Behaviour = ComponentType<{ query: string; takeOver: TakeOver }>

/** ListBehaviour once loaded in this tab: a later visit to the list has it at once. */
let loaded: Behaviour | null = null

const nothingKept: TakeOver = () => []

export function JobsListEnhancer({ query }: { query: string }) {
  const [behaviour, setBehaviour] = useState<{ Component: Behaviour; takeOver: TakeOver } | null>(
    () => (loaded ? { Component: loaded, takeOver: nothingKept } : null),
  )
  const [startedLoaded] = useState(() => loaded !== null)

  useEffect(() => {
    const form = document.getElementById(FILTER_FORM_ID)
    if (startedLoaded || !(form instanceof HTMLFormElement)) return
    const waiting: Waiting[] = []
    let taken = false
    let asked = false
    let arrowKey = false
    const handOver: TakeOver = () => {
      taken = true
      return waiting.splice(0)
    }

    // Without ListBehaviour, the last kept action happens as it does without JavaScript.
    const withoutBehaviour = () => {
      const last = handOver()
        .filter(({ event }) => event.type !== 'input')
        .at(-1)?.event
      if (last?.type === 'click') {
        const link = (last.target as Element).closest<HTMLAnchorElement>('a[data-soft]')
        if (link) location.assign(link.href)
      } else if (last) {
        // A change, as Apply would send it, or the submit itself.
        const submitter = last.type === 'submit' ? (last as SubmitEvent).submitter : null
        try {
          form.requestSubmit(submitter)
        } catch {
          form.submit()
        }
      }
    }

    const load = () => {
      if (asked) return
      asked = true
      import('./ListBehaviour').then((module) => {
        loaded = module.default
        setBehaviour({ Component: module.default, takeOver: handOver })
      }, withoutBehaviour)
    }

    const ours = (target: EventTarget | null) =>
      target instanceof Element &&
      (form.contains(target) ||
        (target as HTMLInputElement).form === form ||
        !!target.closest('a[data-soft]'))

    const wake = (event: Event) => {
      if (taken || !ours(event.target)) return
      load()
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
      load()
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

  if (!behaviour) return null
  const { Component, takeOver } = behaviour
  return <Component query={query} takeOver={takeOver} />
}
