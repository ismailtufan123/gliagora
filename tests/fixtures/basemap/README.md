# Basemap fixture

The basemap the end-to-end tests serve to the map at `/basemap/` (Caddy serves the real one on the server, from `deploy/basemap/fetch-basemap.sh`). Same layout as on the server, made by the same script:

- `current.json`: names the tiles, fonts and sprites below, as on the server;
- `20260930/planet.pmtiles`: the Protomaps build of 2026-09-30, zooms 0–10, only a small part of Istanbul (28.85–29.15° E, 40.95–41.12° N), about 1.6 MB. © OpenStreetMap contributors (ODbL), Protomaps;
- `assets-028c18f/fonts/`: Noto Sans Regular, Medium and Italic, only the ranges 0–255 and 256–511 (Latin, with the Turkish letters); SIL Open Font License, from `protomaps/basemaps-assets` at commit `028c18f`;
- `assets-028c18f/sprites/v4/`: the light and dark sprites; MIT (derived from tangrams/icons), same commit.

Rebuild with `tools/basemap/make-fixture.sh [YYYYMMDD]`.
