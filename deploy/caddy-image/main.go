// Caddy with the rate-limit module (PLAN §18.2, D42): the standard Caddy of the version in go.mod,
// built with github.com/mholt/caddy-ratelimit, the way Caddy's documentation builds one with a
// plugin, with every version fixed by go.mod and go.sum. The Dockerfile beside it puts the result
// into the official image.
package main

import (
	caddycmd "github.com/caddyserver/caddy/v2/cmd"

	// Everything the official build has.
	_ "github.com/caddyserver/caddy/v2/modules/standard"
	// The `rate_limit` directive of deploy/Caddyfile.
	_ "github.com/mholt/caddy-ratelimit"
)

func main() {
	caddycmd.Main()
}
