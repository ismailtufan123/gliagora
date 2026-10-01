'use client'

import { type ComponentProps, Suspense, lazy } from 'react'

// MapView in a chunk of its own, for the jobs list's map view: rendered only with `view=map`, so
// the list without the map never loads it and stays within its JavaScript budget (PLAN §17.3).
// (`next/dynamic` in the server page did not keep the chunk off the list.)
const MapView = lazy(() => import('./MapView').then((module) => ({ default: module.MapView })))

export function LazyMapView(props: ComponentProps<typeof MapView>) {
  return (
    // Until the chunk arrives (after a change of view in the page), an empty box of the map's size.
    <Suspense fallback={<div className="map-pending" />}>
      <MapView {...props} />
    </Suspense>
  )
}
