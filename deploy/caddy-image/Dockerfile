# syntax=docker/dockerfile:1
# Caddy with the rate-limit module (PLAN §18.2, D42): the official Caddy image of the version in
# production, with its program replaced by one built here from the same version of Caddy plus
# github.com/mholt/caddy-ratelimit (main.go; every version is fixed by go.mod and go.sum).
#
# Built by .github/workflows/caddy-image.yml when a file in this folder changes, pushed to GHCR as
# ghcr.io/<owner>/<repository>-caddy:<tag.sh's tag>, and pinned by digest in
# deploy/compose.prod.yml. README.md in this folder says how to change a version.

# The version of Caddy: the same in the base image below, in go.mod and in the image's tag
# (src/lib/deploy-scripts.test.ts checks that they agree).
ARG CADDY_VERSION=2.11.4
ARG CADDY_IMAGE=caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b
ARG GO_IMAGE=golang:1.27.1-alpine@sha256:8a5910f31396cd4d89662f56c68b3ae31d374308270a1c3bd96672ee5ed43414

FROM ${GO_IMAGE} AS build
WORKDIR /src
# Only the Go toolchain of this image, never one downloaded during the build.
ENV GOTOOLCHAIN=local CGO_ENABLED=0 GOFLAGS=-mod=readonly
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY main.go ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -trimpath -ldflags="-s -w" -o /caddy .

FROM ${CADDY_IMAGE}
ARG CADDY_VERSION
COPY --from=build /caddy /usr/bin/caddy
# The build fails unless the program is this version of Caddy and has the module.
RUN caddy version | grep -q "^v${CADDY_VERSION} " \
    && caddy list-modules | grep -qx http.handlers.rate_limit
