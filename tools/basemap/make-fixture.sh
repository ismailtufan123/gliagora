#!/usr/bin/env bash
# Rebuilds tests/fixtures/basemap: the basemap the end-to-end tests serve to the map instead of the
# server's (Caddy serves the real one at /basemap/, deploy/basemap/fetch-basemap.sh). It is the same
# layout, made by the same script, for a small part of Istanbul up to zoom 10 (about 1.6 MB), with
# only the Latin font ranges (0-255 and 256-511, which cover Turkish) and the light and dark sprites.
#
#   tools/basemap/make-fixture.sh [YYYYMMDD]   # a Protomaps build (default: the one in the fixture)
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
fixture="$root/tests/fixtures/basemap"
build="${1:-20260930}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

BASEMAP_DIR="$tmp/public" BASEMAP_BBOX=28.85,40.95,29.15,41.12 BASEMAP_MAXZOOM=10 BASEMAP_MIN_FREE_GB=1 \
  "$root/deploy/basemap/fetch-basemap.sh" "$build"

out="$tmp/fixture"
assets=$(cd "$tmp/public" && ls -d assets-*)
mkdir -p "$out/$build" "$out/$assets/sprites/v4"
cp "$tmp/public/current.json" "$out/current.json"
cp "$tmp/public/$build/planet.pmtiles" "$out/$build/planet.pmtiles"
for font in 'Noto Sans Regular' 'Noto Sans Medium' 'Noto Sans Italic'; do
  mkdir -p "$out/$assets/fonts/$font"
  cp "$tmp/public/$assets/fonts/$font/"{0-255,256-511}.pbf "$out/$assets/fonts/$font/"
done
cp "$tmp/public/$assets/sprites/v4/"{light,dark}{,@2x}.{json,png} "$out/$assets/sprites/v4/"
find "$fixture" -mindepth 1 -maxdepth 1 ! -name README.md -exec rm -rf {} +
cp -R "$out/." "$fixture/"
du -sh "$fixture"
