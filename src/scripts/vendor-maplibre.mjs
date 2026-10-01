// Copies MapLibre GL JS's ES modules from node_modules to public/map/maplibre-gl/<version>/, before
// `next build` and `next dev` (package.json). The map loads them from there with a native import,
// not through the bundler (src/components/map/engine.ts): the page and MapLibre's web worker then
// share one copy of its shared code (maplibre-gl-shared.mjs, about 147 KB gzip), and the worker
// comes from our own origin, which the site's Content-Security-Policy allows (no blob: workers).
// The copies are not committed (.gitignore); the version in the path keeps old copies out of use.
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const source = new URL('node_modules/maplibre-gl/', root)
const { version } = JSON.parse(await readFile(new URL('package.json', source), 'utf8'))
const target = new URL(`public/map/maplibre-gl/${version}/`, root)

await rm(new URL('public/map/maplibre-gl/', root), { recursive: true, force: true })
await mkdir(target, { recursive: true })
for (const file of [
  'maplibre-gl.mjs',
  'maplibre-gl-shared.mjs',
  'maplibre-gl-worker.mjs',
  'maplibre-gl.css',
]) {
  await copyFile(new URL(`dist/${file}`, source), new URL(file, target))
}
await copyFile(new URL('LICENSE.txt', source), new URL('LICENSE.txt', target))
console.log(`MapLibre GL JS ${version} copied to public/map/maplibre-gl/${version}/`)
