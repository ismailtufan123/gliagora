import { version as maplibreVersion } from 'maplibre-gl/package.json'
import { getTranslations } from 'next-intl/server'

import type { MapViewTexts } from './MapView'

// The texts of a map (MapView) from the messages, for the pages that show one: the world map and
// the jobs list's map view.

/** Where the copied MapLibre files are (src/scripts/vendor-maplibre.mjs). */
export const MAP_LIBRARY = `/map/maplibre-gl/${maplibreVersion}/`

export async function mapViewTexts(): Promise<MapViewTexts> {
  const t = await getTranslations({ locale: 'en' })
  return {
    locale: {
      'Map.Title': t('map.controls.title'),
      'NavigationControl.ZoomIn': t('map.controls.zoomIn'),
      'NavigationControl.ZoomOut': t('map.controls.zoomOut'),
      'AttributionControl.ToggleAttribution': t('map.controls.credits'),
      'CooperativeGesturesHandler.WindowsHelpText': t('map.controls.windowsHelp'),
      'CooperativeGesturesHandler.MacHelpText': t('map.controls.macHelp'),
      'CooperativeGesturesHandler.MobileHelpText': t('map.controls.mobileHelp'),
    },
    credits: {
      osm: t('map.credits.osm'),
      protomaps: t('map.credits.protomaps'),
      maplibre: t('map.credits.maplibre'),
    },
    region: t('map.region'),
    skip: t('map.skip'),
    loading: t('map.loading'),
    failed: t('map.failed'),
    noWebgl: t('map.noWebgl'),
    listInView: t('map.listInView'),
    listCount: t.raw('map.listCount') as string,
    listMore: t.raw('map.listMore') as string,
    positionsOne: t.raw('map.positionsOne') as string,
    positionsOther: t.raw('map.positionsOther') as string,
    unmapped: t.raw('map.unmapped') as string,
    close: t('map.panel.close'),
    website: t('map.panel.website'),
    ror: t('map.panel.ror'),
    openPositions: t.raw('map.panel.openPositions') as string,
    closingSoon: t('jobs.closingSoon'),
    institutionPage: t('map.panel.institutionPage'),
    inList: t('map.panel.inList'),
  }
}
