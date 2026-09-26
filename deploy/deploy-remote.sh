#!/usr/bin/env bash
# Server side of the GitHub Actions deploy workflow (.github/workflows/deploy.yml, PLAN §11.5).
#
# The workflow's SSH key may run only this script: its line in ~/.ssh/authorized_keys is
#   restrict,command="/opt/gliagora/deploy-remote.sh" ssh-ed25519 AAAA... gliagora-deploy
# The workflow connects with the command "deploy <tag>" and sends two lines on stdin: a registry
# user name and the job's short-lived GITHUB_TOKEN. This script then:
#   1. accepts only "deploy main" or "deploy sha-<commit>";
#   2. logs in to GHCR with that token in a temporary Docker config, pulls the images and deletes
#      the config again, so no registry credentials stay on the server (D27);
#   3. records the new image in .env (APP_IMAGE);
#   4. runs update.sh --no-pull: backup first, then restart and wait until everything is healthy.
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE="$APP_DIR/.env"
REGISTRY="${DEPLOY_REGISTRY:-ghcr.io}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
compose() { docker compose --project-directory "$APP_DIR" -f "$APP_DIR/compose.prod.yml" "$@"; }

# 1. The only accepted command.
read -r action tag extra <<<"${SSH_ORIGINAL_COMMAND:-}" || true
if [[ "${action:-}" != deploy || -n "${extra:-}" || ! "${tag:-}" =~ ^(main|sha-[0-9a-f]{7,40})$ ]]; then
  echo "Refused. This key may only run: deploy main | deploy sha-<commit>" >&2
  exit 2
fi

IFS= read -r registry_user || true
IFS= read -r registry_token || true
[[ -n "$registry_user" && -n "$registry_token" ]] || fail "No registry login on stdin."

current=$(grep -m1 '^APP_IMAGE=' "$ENV_FILE" | cut -d= -f2-) || fail "APP_IMAGE is missing from $ENV_FILE."
image="${current%:*}:$tag"
[[ "$image" == "$REGISTRY"/* ]] || fail "APP_IMAGE ($current) is not on $REGISTRY."
log "Deploying $image (was $current)"

# 2. Pull with a throwaway registry login.
DOCKER_CONFIG=$(mktemp -d)
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$registry_token" | docker login "$REGISTRY" -u "$registry_user" --password-stdin >/dev/null
APP_IMAGE="$image" compose pull
rm -rf "$DOCKER_CONFIG"

# 3. Record the image, keeping the previous .env for a quick rollback.
cp -p "$ENV_FILE" "$ENV_FILE.previous"
sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$image|" "$ENV_FILE"

# 4. Backup, restart and health checks (root is needed for the backup repository).
sudo -n "$APP_DIR/update.sh" --no-pull
log "Deployed $image"
