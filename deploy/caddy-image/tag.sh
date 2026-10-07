#!/usr/bin/env bash
# Prints the tag of the Caddy image built from this folder: the version of Caddy and a hash of
# the build's inputs, for example 2.11.4-0123456789ab. The same inputs always give the same tag,
# so .github/workflows/caddy-image.yml builds an image only when its tag does not exist yet, and
# src/lib/deploy-scripts.test.ts fails when deploy/compose.prod.yml names an image built from
# other inputs than these.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
version=$(sed -n 's/^ARG CADDY_VERSION=//p' Dockerfile)
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "No CADDY_VERSION in the Dockerfile" >&2; exit 1; }
hash=$(sha256sum Dockerfile go.mod go.sum main.go | sha256sum | cut -c1-12)
echo "$version-$hash"
