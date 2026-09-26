#!/usr/bin/env bash
# Server side of the GitHub Actions deploy workflow (.github/workflows/deploy.yml, PLAN §11.5).
#
# The workflow's SSH key may run only this script: its line in ~/.ssh/authorized_keys is
#   restrict,command="/opt/gliagora/deploy-remote.sh" ssh-ed25519 AAAA... gliagora-deploy
# The workflow connects with the command "deploy <tag>" and sends two lines on stdin: a registry
# user name and the job's short-lived GITHUB_TOKEN. This script then:
#   1. accepts only "deploy main" or "deploy sha-<first 7 characters of a commit>";
#   2. logs in to GHCR with that token in a temporary Docker config, pulls the images and deletes
#      the config again, so no registry credentials stay on the server (D27);
#   3. pins the image to the commit it was built from (sha-<commit>), so .env and .env.previous
#      always name an image that stays on the server and can be rolled back to;
#   4. records the new image in .env (APP_IMAGE);
#   5. runs update.sh --no-pull: backup first, then restart and wait until everything is healthy.
#      If that fails before the app was restarted, .env goes back to the previous image.
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE="$APP_DIR/.env"
REGISTRY="${DEPLOY_REGISTRY:-ghcr.io}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
compose() { docker compose --project-directory "$APP_DIR" -f "$APP_DIR/compose.prod.yml" "$@"; }

# 1. The only accepted command. CI publishes the tags `main` and `sha-` + 7 characters.
read -r action tag extra <<<"${SSH_ORIGINAL_COMMAND:-}" || true
if [[ "${action:-}" != deploy || -n "${extra:-}" || ! "${tag:-}" =~ ^(main|sha-[0-9a-f]{7})$ ]]; then
  echo "Refused. This key may only run: deploy main | deploy sha-<7 characters of a commit>" >&2
  exit 2
fi

IFS= read -r registry_user || true
IFS= read -r registry_token || true
[[ -n "$registry_user" && -n "$registry_token" ]] || fail "No registry login on stdin."

current=$(grep -m1 '^APP_IMAGE=' "$ENV_FILE" | cut -d= -f2-) || fail "APP_IMAGE is missing from $ENV_FILE."
repo="${current%:*}"
image="$repo:$tag"
[[ "$image" == "$REGISTRY"/* ]] || fail "APP_IMAGE ($current) is not on $REGISTRY."
log "Deploying $image (running: $current)"

# 2. Pull with a throwaway registry login.
DOCKER_CONFIG=$(mktemp -d)
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$registry_token" | docker login "$REGISTRY" -u "$registry_user" --password-stdin >/dev/null
APP_IMAGE="$image" compose pull
rm -rf "$DOCKER_CONFIG"

# 3. Pin to the commit (CI labels every image with it), so `main` never ends up in .env.
revision=$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || fail "$image has no org.opencontainers.image.revision label."
pinned="$repo:sha-${revision:0:7}"
[[ "$pinned" == "$image" ]] || docker image tag "$image" "$pinned"
image="$pinned"
log "Pinned to $image"

# 4. Record the image, keeping the previous .env for a quick rollback.
cp -p "$ENV_FILE" "$ENV_FILE.previous"
sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$image|" "$ENV_FILE"

# 5. Backup, restart and health checks (root is needed for the backup repository).
if ! sudo -n "$APP_DIR/update.sh" --no-pull; then
  running=$(docker inspect -f '{{.Config.Image}}' "$(compose ps -aq app 2>/dev/null)" 2>/dev/null || true)
  if [[ "$running" != "$image" ]]; then
    cp -p "$ENV_FILE.previous" "$ENV_FILE"
    log "The app was not restarted; APP_IMAGE in .env is back to $current."
  fi
  fail "The update did not finish; see the messages above."
fi
log "Deployed $image"
