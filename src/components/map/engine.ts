import { type Flavor, layers, namedFlavor } from '@protomaps/basemaps'
import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  MapOptions,
  StyleSpecification,
} from 'maplibre-gl'
import { Protocol } from 'pmtiles'

import type { MapJson } from '@/lib/map/data'

// The map itself (PLAN §14), loaded only when a map is shown (MapView imports this module on
// demand). MapLibre GL JS comes from our own origin with a native import, not through the bundler
// (src/scripts/vendor-maplibre.mjs): its web worker then starts from the same folder and shares
// MapLibre's code with the page. The basemap (tiles, fonts, sprites) is named by
// /basemap/current.json (deploy/basemap/fetch-basemap.sh); without it the map shows the pins on a
// plain background. Colours come from the design tokens, read from the page's CSS, so light and
// dark follow the site.

type MapLibre = typeof import('maplibre-gl')

/** The basemap's files, as /basemap/current.json names them. */
type Basemap = { tiles: string; glyphs: string; sprites: string }

export type EngineTexts = {
  /** MapLibre's own controls and messages (its `locale` option). */
  locale: Record<string, string>
  /** The credits in the map's corner (PLAN §14), each linked to its source. */
  credits: { osm: string; protomaps: string; maplibre: string }
}

const CREDIT_LINKS = {
  osm: 'https://www.openstreetmap.org/copyright',
  protomaps: 'https://protomaps.com/',
  maplibre: 'https://maplibre.org/',
} as const

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/** MapLibre shows the credits as HTML: our texts, escaped, in links to the sources. */
const credits = ({ credits }: EngineTexts) =>
  (Object.keys(CREDIT_LINKS) as (keyof typeof CREDIT_LINKS)[]).map(
    (key) => `<a href="${CREDIT_LINKS[key]}">${escapeHtml(credits[key])}</a>`,
  )

export type EngineOptions = {
  container: HTMLElement
  /** The folder of the copied MapLibre files, ending with a slash. */
  library: string
  data: MapJson
  texts: EngineTexts
  /** A pin was chosen (or the map clicked elsewhere: null). */
  onSelect: (id: number | null) => void
  /** The institutions whose pins are in view, after each move. */
  onView: (ids: number[]) => void
}

export type Engine = {
  /** Shows an institution: zooms to it (unless already close) and marks its pin. */
  show: (id: number, options?: { zoom?: boolean }) => void
  /** Marks a pin (or none) without moving the map, e.g. while a list row is hovered. */
  highlight: (id: number | null) => void
  /** New data for the same map, after the filters changed. */
  setData: (data: MapJson) => void
  /** The map's size changed (a panel opened, the layout changed). */
  resize: () => void
  destroy: () => void
}

const SOURCE = 'institutions'
/** Zoom at which clusters break up into single institutions (PLAN §14). */
const CLUSTER_MAX_ZOOM = 12
/** The zoom an institution chosen from the list is shown at, unless the map is closer. */
const SHOW_ZOOM = 9
const FONT = ['Noto Sans Medium']

let loading: Promise<MapLibre> | null = null

/** MapLibre GL JS from our origin, once per page, with its stylesheet and the pmtiles protocol. */
function loadLibrary(library: string): Promise<MapLibre> {
  loading ??= (async () => {
    if (!document.querySelector('link[data-maplibre]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = `${library}maplibre-gl.css`
      link.dataset.maplibre = ''
      document.head.append(link)
    }
    const maplibre = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ `${library}maplibre-gl.mjs`
    )) as MapLibre
    const protocol = new Protocol()
    maplibre.addProtocol('pmtiles', protocol.tile)
    return maplibre
  })()
  return loading
}

/** The basemap's files, or null when the server has none (yet). */
async function loadBasemap(): Promise<Basemap | null> {
  try {
    const response = await fetch('/basemap/current.json', { cache: 'no-cache' })
    if (!response.ok) {
      // Unread, the answer (a 404 page) would stay open.
      await response.body?.cancel()
      return null
    }
    const json = (await response.json()) as Partial<Basemap>
    const { tiles, glyphs, sprites } = json
    const local = (path: unknown): path is string =>
      typeof path === 'string' && path.startsWith('/basemap/')
    return local(tiles) && local(glyphs) && local(sprites) ? { tiles, glyphs, sprites } : null
  } catch {
    return null
  }
}

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const isDark = () => matchMedia('(prefers-color-scheme: dark)').matches

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** The Protomaps flavour, its main colours taken from our tokens (PLAN §7.2, §14). */
function flavor(dark: boolean): Flavor {
  const base = namedFlavor(dark ? 'dark' : 'light')
  const text = token('--text-muted')
  const halo = token('--surface')
  return {
    ...base,
    background: token('--bg'),
    earth: token('--surface'),
    water: token('--surface-sunken'),
    boundaries: token('--line-strong'),
    ocean_label: text,
    country_label: text,
    state_label: text,
    state_label_halo: halo,
    city_label: token('--text'),
    city_label_halo: halo,
    subplace_label: text,
    subplace_label_halo: halo,
    // Land cover stays quiet (PLAN §14: a minimal style): the land's own colour, so the pins
    // stand out; parks and woods keep the flavour's soft greens at closer zooms.
    landcover: {
      barren: token('--surface'),
      farmland: token('--surface'),
      forest: token('--surface'),
      glacier: token('--surface'),
      grassland: token('--surface'),
      scrub: token('--surface'),
      urban_area: token('--surface'),
    },
    regular: 'Noto Sans Regular',
    bold: 'Noto Sans Medium',
    italic: 'Noto Sans Italic',
  }
}

/** Pins and clusters: a disc with the number of positions (PLAN §14). */
function pinLayers(withText: boolean): LayerSpecification[] {
  const accent = token('--accent')
  const onAccent = token('--on-accent')
  const ring = token('--text')
  const radius: ExpressionSpecification = ['step', ['get', 'jobs'], 12, 5, 15, 20, 19, 100, 23]
  const disc = (id: string, filter: ExpressionSpecification): LayerSpecification => ({
    id,
    type: 'circle',
    source: SOURCE,
    filter,
    paint: {
      'circle-color': accent,
      'circle-radius': radius,
      'circle-stroke-color': onAccent,
      'circle-stroke-width': 2,
    },
  })
  const count = (id: string, filter: ExpressionSpecification): LayerSpecification => ({
    id,
    type: 'symbol',
    source: SOURCE,
    filter,
    layout: {
      'text-field': ['to-string', ['get', 'jobs']],
      'text-font': FONT,
      'text-size': 13,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': onAccent },
  })
  const clustered: ExpressionSpecification = ['has', 'point_count']
  const single: ExpressionSpecification = ['!', ['has', 'point_count']]
  return [
    disc('clusters', clustered),
    disc('pins', single),
    // The chosen or hovered institution: a ring in the text colour, so it shows in both themes.
    // (Feature state may decide paint, not filters.)
    {
      id: 'pin-mark',
      type: 'circle',
      source: SOURCE,
      filter: single,
      paint: {
        'circle-opacity': 0,
        'circle-radius': ['+', radius, 4],
        'circle-stroke-color': ring,
        'circle-stroke-width': 3,
        'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'marked'], false], 1, 0],
      },
    },
    ...(withText ? [count('cluster-counts', clustered), count('pin-counts', single)] : []),
  ]
}

function style(data: MapJson, basemap: Basemap | null): StyleSpecification {
  const theme = flavor(isDark())
  const base: LayerSpecification[] = basemap
    ? layers('protomaps', theme, { lang: 'en' })
    : [{ id: 'background', type: 'background', paint: { 'background-color': theme.background } }]
  return {
    version: 8,
    ...(basemap
      ? {
          glyphs: `${location.origin}${basemap.glyphs}`,
          sprite: `${location.origin}${basemap.sprites}/${isDark() ? 'dark' : 'light'}`,
        }
      : {}),
    sources: {
      ...(basemap
        ? {
            protomaps: {
              type: 'vector',
              url: `pmtiles://${location.origin}${basemap.tiles}`,
            },
          }
        : {}),
      [SOURCE]: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: data.features },
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterProperties: { jobs: ['+', ['get', 'jobs']] },
      },
    },
    layers: [...base, ...pinLayers(basemap !== null)],
  }
}

/** The bounds of the pins, or null when there are none. */
function bounds(data: MapJson): [[number, number], [number, number]] | null {
  if (data.features.length === 0) return null
  let [west, south, east, north] = [180, 90, -180, -90]
  for (const { geometry } of data.features) {
    const [lng, lat] = geometry.coordinates
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [
    [west, south],
    [east, north],
  ]
}

export async function createEngine(options: EngineOptions): Promise<Engine> {
  const { container, texts, onSelect, onView } = options
  let data = options.data
  const [maplibre, basemap] = await Promise.all([loadLibrary(options.library), loadBasemap()])

  const fit = bounds(data)
  const mapOptions: MapOptions = {
    container,
    style: style(data, basemap),
    attributionControl: { compact: false, customAttribution: credits(texts) },
    locale: texts.locale,
    // Page scrolling stays with one finger and the wheel; the map moves with two fingers or Ctrl.
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxZoom: 16,
    renderWorldCopies: false,
    fadeDuration: reducedMotion() ? 0 : 300,
    ...(fit
      ? { bounds: fit, fitBoundsOptions: { padding: 48, maxZoom: 6 } }
      : { center: [15, 30], zoom: 1 }),
  }
  const map: MapLibreMap = new maplibre.Map(mapOptions)
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-left')

  const duration = () => (reducedMotion() ? 0 : 600)
  // Marks are kept here and drawn once the style has loaded (and again after a new style).
  let marked: number | null = null
  let loaded = false
  const mark = (id: number | null) => {
    if (loaded && marked !== null) {
      map.setFeatureState({ source: SOURCE, id: marked }, { marked: false })
    }
    marked = id
    if (loaded && id !== null) map.setFeatureState({ source: SOURCE, id }, { marked: true })
  }

  const reportView = () => {
    const visible = map.getBounds()
    onView(
      data.features
        .filter(({ geometry }) => visible.contains(geometry.coordinates))
        .map((feature) => feature.id),
    )
  }

  map.on('click', 'clusters', async (event) => {
    const feature = event.features?.[0]
    const clusterId = feature?.properties?.cluster_id as number | undefined
    if (feature?.geometry.type !== 'Point' || clusterId === undefined) return
    const source = map.getSource<GeoJSONSource>(SOURCE)
    const zoom = await source?.getClusterExpansionZoom(clusterId)
    if (zoom === undefined) return
    map.easeTo({
      center: feature.geometry.coordinates as [number, number],
      zoom,
      duration: duration(),
    })
  })
  map.on('click', 'pins', (event) => {
    const id = event.features?.[0]?.id
    if (typeof id === 'number') onSelect(id)
  })
  map.on('click', (event) => {
    if (map.queryRenderedFeatures(event.point, { layers: ['clusters', 'pins'] }).length === 0) {
      onSelect(null)
    }
  })
  for (const layer of ['clusters', 'pins']) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
  }
  map.on('moveend', reportView)
  map.once('load', () => {
    loaded = true
    mark(marked)
    reportView()
  })

  // Light and dark follow the system, as the rest of the site (tokens.css).
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  const restyle = () => {
    loaded = false
    map.setStyle(style(data, basemap))
    map.once('idle', () => {
      loaded = true
      mark(marked)
    })
  }
  scheme.addEventListener('change', restyle)

  return {
    show(id, { zoom = true } = {}) {
      const feature = data.features.find((candidate) => candidate.id === id)
      if (!feature) return
      mark(id)
      if (!zoom) return
      map.easeTo({
        center: feature.geometry.coordinates,
        zoom: Math.max(map.getZoom(), SHOW_ZOOM),
        duration: duration(),
      })
    },
    highlight(id) {
      mark(id)
    },
    setData(next) {
      data = next
      if (marked !== null && !next.features.some((feature) => feature.id === marked)) mark(null)
      map.getSource<GeoJSONSource>(SOURCE)?.setData({
        type: 'FeatureCollection',
        features: next.features,
      })
      // New filters: show their pins (World → country, PLAN §14), or keep the view if none.
      const fit = bounds(next)
      if (fit) map.fitBounds(fit, { padding: 48, maxZoom: 6, duration: duration() })
      else reportView()
    },
    resize() {
      map.resize()
    },
    destroy() {
      scheme.removeEventListener('change', restyle)
      map.remove()
    },
  }
}
