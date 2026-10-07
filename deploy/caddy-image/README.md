# The server's Caddy image

Caddy as the server runs it: the official image of the version in production, with the program
built here from the same version of Caddy plus the rate-limit module
[`github.com/mholt/caddy-ratelimit`](https://github.com/mholt/caddy-ratelimit) (PLAN §18.2, D42),
which the limits in `deploy/Caddyfile` need.

| File | What it is |
| --- | --- |
| `main.go` | Caddy's standard modules and the rate-limit module |
| `go.mod`, `go.sum` | Every version, fixed: Caddy, the module (a commit of its `master`: the `ipv6_prefix` setting the limits use is in no release yet) and everything they need |
| `Dockerfile` | Builds the program with a pinned Go image and puts it into the pinned official Caddy image |
| `tag.sh` | The image's tag: the version of Caddy and a hash of the four files above |

`.github/workflows/caddy-image.yml` builds the image when one of these files changes, on any
branch, and pushes it to GHCR as `ghcr.io/ismailtufan123/gliagora-caddy:<tag>`; a tag that exists
is never built again. `deploy/compose.prod.yml` pins the image by its digest. The end-to-end tests
in CI run the program of exactly that image (`CADDY_BIN`), and a unit test fails when
`compose.prod.yml` names an image built from other inputs than this folder's.

## Changing a version

1. Change it: Caddy in `go.mod` and in both `ARG` lines of the `Dockerfile` (the tag's digest from
   Docker Hub), the module in `go.mod`, or the Go image in the `Dockerfile`. Then, in this folder,
   `go mod tidy` (with Go installed), and commit `go.mod` and `go.sum`.
2. Push the branch. The workflow builds the image; its run's summary shows the new line for
   `deploy/compose.prod.yml` (the tag and the digest).
3. Put that line into `compose.prod.yml` in the same pull request; `pnpm test` then passes again.
4. After the merge, copy `compose.prod.yml` to the server and run `update.sh` (`deploy/README.md`,
   "Update and roll back"), with the operator's go-ahead.

## The same program on your computer

The end-to-end tests of the M2 state and of the rate limits need this build as `CADDY_BIN`; the
official Caddy does not know the `rate_limit` directive. With Go installed:

```sh
cd deploy/caddy-image
CGO_ENABLED=0 go build -trimpath -o ~/.local/bin/caddy-gliagora .
```
