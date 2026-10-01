'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import type { MapInstitutionInfo, MapJson } from '@/lib/map/data'

import type { Engine, EngineTexts } from './engine'
import { canDrawMaps } from './support'

// A map of institutions with open positions (PLAN §14, §9.6), with the keyboard and screen-reader
// alternative next to it: the list of institutions in view, each opening the same panel as its
// pin. The map's code (MapLibre, about 300 KB gzip) loads only here, after the page, and only in
// browsers that can draw it (WebGL); without JavaScript or WebGL the list is the page.

/** Texts from the messages; `{count}`, `{shown}` and `{total}` are filled in here. */
export type MapViewTexts = EngineTexts & {
  region: string
  skip: string
  loading: string
  failed: string
  noWebgl: string
  listInView: string
  listCount: string
  listMore: string
  positionsOne: string
  positionsOther: string
  unmapped: string
  close: string
  website: string
  ror: string
  openPositions: string
  closingSoon: string
  institutionPage: string
  inList: string
}

type Props = {
  /** The data's address, with the filters (src/lib/map/data.ts). */
  dataPath: string
  /** The folder of the copied MapLibre files. */
  library: string
  texts: MapViewTexts
  /** The list as the server drew it: shown until the data is here, and without JavaScript. */
  children: ReactNode
}

type Status = 'loading' | 'ready' | 'failed' | 'no-webgl'

/** At most this many institutions in the list at once; zooming in narrows it. */
const LIST_LIMIT = 50

const fill = (text: string, values: Record<string, number>) =>
  text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''))

export function MapView({ dataPath, library, texts, children }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const engine = useRef<Engine | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<MapJson | null>(null)
  const [inView, setInView] = useState<number[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  const positions = (count: number) =>
    fill(count === 1 ? texts.positionsOne : texts.positionsOther, { count })

  const select = useCallback((id: number | null) => {
    setSelected(id)
    engine.current?.highlight(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    let created: Engine | null = null
    ;(async () => {
      try {
        const response = await fetch(dataPath)
        if (!response.ok) {
          await response.body?.cancel()
          throw new Error(`Map data: ${response.status}`)
        }
        const json = (await response.json()) as MapJson
        if (cancelled) return
        setData(json)
        if (!canDrawMaps()) {
          setStatus('no-webgl')
          return
        }
        const { createEngine } = await import('./engine')
        if (cancelled || !container.current) return
        created = await createEngine({
          container: container.current,
          library,
          data: json,
          texts,
          onSelect: (id) => {
            opener.current = container.current?.querySelector('canvas') ?? null
            select(id)
          },
          onView: setInView,
        })
        if (cancelled) {
          created.destroy()
          return
        }
        engine.current = created
        setStatus('ready')
      } catch (error) {
        if (cancelled) return
        console.error('The map failed to load:', error instanceof Error ? error.name : error)
        setStatus((current) => (current === 'no-webgl' ? current : 'failed'))
      }
    })()
    return () => {
      cancelled = true
      created?.destroy()
      engine.current = null
    }
    // The texts and the library are fixed for the page; a new data address means new filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataPath])

  const close = useCallback(() => {
    select(null)
    opener.current?.focus()
  }, [select])

  // The panel takes focus when it opens (PLAN §14); Esc closes it while focus is in the map.
  useEffect(() => {
    if (selected === null) return
    heading.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && root.current?.contains(document.activeElement)) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, close])

  const info: MapInstitutionInfo | undefined =
    selected === null ? undefined : data?.institutions[String(selected)]

  // Institutions in view (all of them until the map reports), most positions first.
  const listed = data
    ? data.features
        .filter((feature) => inView === null || inView.includes(feature.id))
        .sort(
          (a, b) =>
            b.properties.jobs - a.properties.jobs ||
            (data.institutions[a.id]?.name ?? '').localeCompare(
              data.institutions[b.id]?.name ?? '',
            ),
        )
    : []

  return (
    <div ref={root} className="map-view" data-status={status}>
      {status !== 'no-webgl' && (
        <>
          <a href="#map-list" className="map-skip">
            {texts.skip}
          </a>
          <div className="map-frame">
            <div ref={container} className="map-canvas" role="region" aria-label={texts.region} />
            {status === 'loading' && <p className="map-message">{texts.loading}</p>}
            {status === 'failed' && <p className="map-message">{texts.failed}</p>}
            {info && (
              <aside className="map-panel" aria-labelledby="map-panel-title">
                <div className="map-panel-head">
                  <h2 id="map-panel-title" ref={heading} tabIndex={-1} className="text-h3">
                    {info.name}
                  </h2>
                  <button type="button" className="button button-secondary" onClick={close}>
                    {texts.close}
                  </button>
                </div>
                {info.place && <p className="text-muted">{info.place}</p>}
                {(info.website || info.ror) && (
                  <p className="map-panel-links">
                    {info.website && <a href={info.website}>{texts.website}</a>}
                    {info.ror && <a href={info.ror}>{texts.ror}</a>}
                  </p>
                )}
                <h3 className="text-card">
                  {fill(texts.openPositions, { count: info.jobs.length })}
                </h3>
                <ul role="list" className="map-panel-jobs">
                  {info.jobs.map((job) => (
                    <li key={job.path}>
                      <a href={job.path}>{job.title}</a>
                      <span className="text-muted">
                        {job.deadline}
                        {job.soon && (
                          <>
                            <span className="sr-only">,</span>{' '}
                            <span className="badge">{texts.closingSoon}</span>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="map-panel-actions">
                  <a href={info.listPath}>{texts.inList}</a>
                  <a href={info.path}>{texts.institutionPage}</a>
                </p>
              </aside>
            )}
          </div>
        </>
      )}
      {status === 'no-webgl' && <p className="map-message-static">{texts.noWebgl}</p>}
      <section id="map-list" className="map-list" aria-labelledby="map-list-title" tabIndex={-1}>
        {data ? (
          <>
            <h2 id="map-list-title" className="text-h3">
              {texts.listInView}{' '}
              <span className="text-muted">
                {fill(texts.listCount, { shown: listed.length, total: data.features.length })}
              </span>
            </h2>
            <ul role="list">
              {listed.slice(0, LIST_LIMIT).map((feature) => {
                const institution = data.institutions[feature.id]
                if (!institution) return null
                return (
                  <li key={feature.id}>
                    {status === 'ready' ? (
                      <button
                        type="button"
                        className="map-list-item"
                        aria-pressed={selected === feature.id}
                        onClick={(event) => {
                          opener.current = event.currentTarget
                          select(feature.id)
                          engine.current?.show(feature.id)
                        }}
                        onMouseEnter={() => engine.current?.highlight(feature.id)}
                        onMouseLeave={() => engine.current?.highlight(selected)}
                      >
                        <span>{institution.name}</span>
                        <span className="text-muted">{positions(feature.properties.jobs)}</span>
                      </button>
                    ) : (
                      <a href={institution.path} className="map-list-item">
                        <span>{institution.name}</span>
                        <span className="text-muted">{positions(feature.properties.jobs)}</span>
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
            {listed.length > LIST_LIMIT && (
              <p className="text-muted">
                {fill(texts.listMore, { count: listed.length - LIST_LIMIT })}
              </p>
            )}
            {data.unmapped > 0 && (
              <p className="text-muted">{fill(texts.unmapped, { count: data.unmapped })}</p>
            )}
          </>
        ) : (
          children
        )}
      </section>
    </div>
  )
}
