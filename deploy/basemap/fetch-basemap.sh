#!/usr/bin/env bash
# Puts the map's basemap on the server (PLAN §14, M5): an extract of the Protomaps planet
# (OpenStreetMap data, ODbL) up to zoom 10, about 3.8 GB, and the fonts and sprites of its style.
# Caddy serves the folder at /basemap/ (deploy/Caddyfile); the map first reads /basemap/current.json,
# which names the files, so a new basemap needs no restart and no deploy.
#
#   sudo /opt/gliagora/basemap/fetch-basemap.sh            # the newest Protomaps build
#   sudo /opt/gliagora/basemap/fetch-basemap.sh 20260930   # the build of that day (YYYYMMDD)
#   sudo /opt/gliagora/basemap/fetch-basemap.sh --rollback # back to the basemap before the last run
#
# Run it once, then about twice a year (PLAN §14). Nothing is served until every file is in place
# and checked; current.json changes last. The basemap it replaces stays until the next run, for a
# rollback; older ones are deleted. The basemap is not personal data and is not backed up: run this
# again after a restore onto a new server.
#
# What it downloads, and from where (docs/vendors.md): the pmtiles tool from GitHub (a pinned
# release, checked by its SHA-256), the tiles from build.protomaps.com (only zooms 0 to 10, read
# with HTTP range requests), and the fonts (SIL Open Font License) and sprites (MIT) from a pinned
# commit of github.com/protomaps/basemaps-assets, checked by a digest of their files.
set -euo pipefail

BASEMAP_DIR="${BASEMAP_DIR:-/opt/gliagora/basemap/public}"
MAXZOOM="${BASEMAP_MAXZOOM:-10}"
BBOX="${BASEMAP_BBOX:-}" # for tests only: a small area instead of the world

PMTILES_VERSION=1.31.2
PMTILES_SHA256=3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f
ASSETS_COMMIT=028c18f713baecad011301ff7a69acc39bcc2ae7
# sha256 of the sorted `sha256sum` lines of fonts/ and sprites/v4/ (see check_assets below).
ASSETS_DIGEST=d3d7c30e45587e572efbca82ce11a14da7b9b3a43d14dca4edd0ba18ed73c1f7
BUILDS_URL=https://build-metadata.protomaps.dev/builds.json
BUILD_BASE=https://build.protomaps.com
MIN_FREE_GB="${BASEMAP_MIN_FREE_GB:-10}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

install -d -m 755 "$BASEMAP_DIR"
[[ -w "$BASEMAP_DIR" ]] || fail "Cannot write to $BASEMAP_DIR (run with sudo)."
current="$BASEMAP_DIR/current.json"
previous="$BASEMAP_DIR/previous.json"

# The version a current.json points to ("tiles": "/basemap/<version>/…").
version_of() { sed -n 's|.*"tiles": *"/basemap/\([0-9]\{8\}\)/.*|\1|p' "$1" 2>/dev/null || true; }

if [[ "${1:-}" == --rollback ]]; then
  [[ -s "$previous" ]] || fail "There is no earlier basemap to go back to."
  [[ -d "$BASEMAP_DIR/$(version_of "$previous")" ]] || fail "The earlier basemap's files are gone."
  cp -p "$current" "$current.tmp" 2>/dev/null || true
  cp -p "$previous" "$current"
  [[ -s "$current.tmp" ]] && mv "$current.tmp" "$previous"
  log "Back to basemap $(version_of "$current")."
  exit 0
fi

build="${1:-}"
free_gb=$(df -P -BG "$BASEMAP_DIR" | awk 'NR == 2 { gsub("G", "", $4); print $4 }')
((free_gb >= MIN_FREE_GB)) || fail "Only ${free_gb} GB free in $BASEMAP_DIR; at least $MIN_FREE_GB GB needed."

work=$(mktemp -d "$BASEMAP_DIR/.fetch-XXXXXX")
trap 'rm -rf "$work"' EXIT

# 1. The pmtiles tool, a pinned release checked by its checksum.
log "Downloading pmtiles $PMTILES_VERSION"
curl -fsSL -o "$work/pmtiles.tar.gz" \
  "https://github.com/protomaps/go-pmtiles/releases/download/v$PMTILES_VERSION/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz"
echo "$PMTILES_SHA256  $work/pmtiles.tar.gz" | sha256sum -c --quiet - || fail "pmtiles has the wrong checksum."
tar xzf "$work/pmtiles.tar.gz" -C "$work" pmtiles
pmtiles="$work/pmtiles"

# 2. Which build: the newest unless one is named.
if [[ -z "$build" ]]; then
  build=$(curl -fsSL "$BUILDS_URL" | grep -o '"key": *"[0-9]\{8\}\.pmtiles"' | tail -n 1 | grep -o '[0-9]\{8\}')
fi
[[ "$build" =~ ^[0-9]{8}$ ]] || fail "Name a build as YYYYMMDD (see $BUILDS_URL)."
if [[ "$(version_of "$current")" == "$build" && -z "$BBOX" ]]; then
  log "Basemap $build is already the current one."
  exit 0
fi

# 3. The tiles up to zoom $MAXZOOM, then a check of the whole archive.
log "Extracting build $build up to zoom $MAXZOOM${BBOX:+ within $BBOX} (about 3.8 GB for the world)"
"$pmtiles" extract "$BUILD_BASE/$build.pmtiles" "$work/planet.pmtiles" --maxzoom="$MAXZOOM" \
  ${BBOX:+--bbox="$BBOX"}
"$pmtiles" verify "$work/planet.pmtiles" >/dev/null || fail "The extract did not pass pmtiles verify."
install -d -m 755 "$work/$build"
mv "$work/planet.pmtiles" "$work/$build/planet.pmtiles"
chmod 644 "$work/$build/planet.pmtiles"

# 4. Fonts and sprites of the style, once per pinned commit.
assets="assets-${ASSETS_COMMIT:0:7}"
check_assets() {
  (cd "$1" && LC_ALL=C find fonts sprites/v4 -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum |
    sha256sum | cut -d' ' -f1)
}
if [[ ! -d "$BASEMAP_DIR/$assets" ]]; then
  log "Downloading fonts and sprites ($assets)"
  curl -fsSL -o "$work/assets.tar.gz" "https://codeload.github.com/protomaps/basemaps-assets/tar.gz/$ASSETS_COMMIT"
  install -d "$work/assets-src"
  tar xzf "$work/assets.tar.gz" -C "$work/assets-src" --strip-components=1
  install -d -m 755 "$work/$assets/sprites"
  mv "$work/assets-src/fonts" "$work/$assets/fonts"
  mv "$work/assets-src/sprites/v4" "$work/$assets/sprites/v4"
  [[ "$(check_assets "$work/$assets")" == "$ASSETS_DIGEST" ]] || fail "The fonts and sprites are not the expected files."
  chmod -R u=rwX,go=rX "$work/$assets"
  mv "$work/$assets" "$BASEMAP_DIR/$assets"
fi

# 5. Into place: the new tiles, then current.json (the old one becomes previous.json).
rm -rf "${BASEMAP_DIR:?}/$build"
mv "$work/$build" "$BASEMAP_DIR/$build"
cat >"$work/current.json" <<EOF
{
  "version": "$build",
  "tiles": "/basemap/$build/planet.pmtiles",
  "glyphs": "/basemap/$assets/fonts/{fontstack}/{range}.pbf",
  "sprites": "/basemap/$assets/sprites/v4"
}
EOF
chmod 644 "$work/current.json"
[[ -s "$current" ]] && cp -p "$current" "$previous"
mv "$work/current.json" "$current"
log "Basemap $build is now current ($(du -sh "$BASEMAP_DIR/$build" | cut -f1))."

# 6. Keep the current and the previous basemap; delete older ones.
keep=("$(version_of "$current")" "$(version_of "$previous")")
for dir in "$BASEMAP_DIR"/[0-9]*; do
  [[ -d "$dir" ]] || continue
  name=$(basename "$dir")
  [[ " ${keep[*]} " == *" $name "* ]] && continue
  log "Deleting the old basemap $name"
  rm -rf "$dir"
done
log "Done. Check the map at /en/map/; to go back: $0 --rollback"
