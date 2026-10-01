// Small enough to load with the page: MapView asks before it loads the map's code.

/** Whether this browser can draw the map (WebGL); without it the page shows the list only. */
export function canDrawMaps(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
