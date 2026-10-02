#!/usr/bin/env bash
# Server side of the GitHub Actions deploy workflow (.github/workflows/deploy.yml, PLAN §11.5).
#
# The workflow logs in as the user `deploy` (setup-server.sh), whose only key may run only this
# script, as root, through one sudo rule (D42). Its line in /home/deploy/.ssh/authorized_keys is
#   restrict,command="sudo -n /opt/gliagora/deploy-remote.sh" ssh-ed25519 AAAA... gliagora-deploy
# The workflow connects with the command "deploy <tag>" (passed on by sudo as SSH_ORIGINAL_COMMAND)
# and sends two lines on stdin: a registry user name and the job's short-lived GITHUB_TOKEN.
# This script then:
#   1. accepts only "deploy main" or "deploy sha-<first 7 characters of a commit>";
#   2. logs in to GHCR with that token in a temporary Docker config, pulls the app's image (only
#      that one: a hiccup of another registry cannot stop a deploy; update.sh pulls a missing public
#      image itself) and deletes the config again, so no registry credentials stay on the server
#      (D27);
#   3. pins the image to the commit it was built from (sha-<commit>), so .env and .env.previous
#      always name an image that stays on the server and can be rolled back to;
#   4. records the new image in .env (APP_IMAGE), keeping the old file as .env.previous;
#   5. runs update.sh --no-pull: backup first, then restart and wait until everything is healthy.
#      If that fails before the app was restarted, APP_IMAGE in .env goes back to the previous
#      image;
#   6. if the new image started but did not become healthy, switches back to the previous image
#      (still on the server) and waits for it (automatic rollback, D42). Database migrations are
#      not undone; the pre-update backup has the state before them. If the new image is healthy and
#      another service is not (or listmonk could not be prepared: update.sh's exit code 3), it
#      does not roll back: the app is fine, and going back would not help the other service; it
#      fails with the names of the services to look at.
# Going back sets only the APP_IMAGE line of .env, never the whole file: a setting added to .env
# since the last deploy (a new secret) must stay.
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE="$APP_DIR/.env"
REGISTRY="${DEPLOY_REGISTRY:-ghcr.io}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
compose() { docker compose --project-directory "$APP_DIR" -f "$APP_DIR/compose.prod.yml" "$@"; }

# Sets the APP_IMAGE line of an env file, and nothing else: set_app_image FILE IMAGE.
set_app_image() {
  [[ "$2" =~ ^[A-Za-z0-9./:_@-]+$ ]] || { log "ERROR: not an image name: $2" >&2; return 1; }
  sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$2|" "$1"
}

# The services that are not running and healthy, from lines "service state health" (as
# `docker compose ps --all --format '{{.Service}} {{.State}} {{.Health}}'` prints them; a service
# without a health check has none): their names, separated by spaces.
unhealthy_services() {
  local service state health out=()
  while read -r service state health; do
    [[ -n "$service" ]] || continue
    if [[ "$state" != running || ( -n "$health" && "$health" != healthy ) ]]; then out+=("$service"); fi
  done
  echo "${out[*]}"
}

# The app container's health ("healthy", "unhealthy", "starting", or empty without one).
app_health() {
  local id
  id=$(compose ps -q app 2>/dev/null) || true
  [[ -n "$id" ]] || return 0
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" 2>/dev/null || true
}

# update.sh's exit code when everything but listmonk was updated and is healthy, and listmonk
# could not be prepared.
LISTMONK_NOT_PREPARED=3

# What happened after update.sh failed with exit code $1, the new image being $2, as a word and
# then the services concerned:
#   not-restarted       the app still runs another image (the update stopped before restarting it);
#   rollback            the new image runs but is not healthy;
#   listmonk            the new image is healthy, and listmonk could not be prepared;
#   others SERVICES...  the new image is healthy, and these services are not (none, by now).
failed_update() {
  local status=$1 image=$2 running
  running=$(docker inspect -f '{{.Config.Image}}' "$(compose ps -aq app 2>/dev/null)" 2>/dev/null || true)
  if [[ "$running" != "$image" ]]; then
    echo not-restarted
  elif [[ "$(app_health)" != healthy ]]; then
    echo rollback
  elif [[ $status -eq $LISTMONK_NOT_PREPARED ]]; then
    echo listmonk
  else
    echo "others $(compose ps --all --format '{{.Service}} {{.State}} {{.Health}}' | unhealthy_services)"
  fi
}

# Sourced, as src/lib/deploy-scripts.test.ts does: the functions above only.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

# 1. The only accepted command. CI publishes the tags `main` and `sha-` + 7 characters.
read -r action tag extra <<<"${SSH_ORIGINAL_COMMAND:-}" || true
if [[ "${action:-}" != deploy || -n "${extra:-}" || ! "${tag:-}" =~ ^(main|sha-[0-9a-f]{7})$ ]]; then
  echo "Refused. This key may only run: deploy main | deploy sha-<7 characters of a commit>" >&2
  exit 2
fi
[[ $EUID -eq 0 ]] || fail "Run through the deploy user's sudo rule (setup-server.sh), as root."

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
APP_IMAGE="$image" compose pull app
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

# 5. Backup, restart and health checks.
status=0
"$APP_DIR/update.sh" --no-pull || status=$?
if [[ $status -eq 0 ]]; then
  log "Deployed $image"
  exit 0
fi

read -r verdict others <<<"$(failed_update "$status" "$image")"
case $verdict in
  not-restarted)
    set_app_image "$ENV_FILE" "$current"
    fail "The update stopped before the app was restarted (see above): the app still runs $current, and APP_IMAGE in .env is back to it."
    ;;
  # The new image is healthy: another service failed; going back to the previous image would not
  # help it.
  listmonk)
    fail "$image is deployed and healthy, but listmonk could not be prepared (see above): not rolled back. Fix the cause, then run sudo ./listmonk/prepare.sh and docker compose -f compose.prod.yml up -d listmonk (README.md, section 11)."
    ;;
  others)
    fail "$image is deployed and healthy, but ${others:-another service} is not (see above): not rolled back. See: docker compose -f compose.prod.yml logs ${others:-<service>}"
    ;;
esac

# 6. Automatic rollback: the new image started but did not become healthy.
image_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }
previous_id=$(image_id "$current")
if [[ -z "$previous_id" || "$previous_id" == "$(image_id "$image")" ]]; then
  fail "$image did not become healthy, and there is no earlier image on the server to go back to (the first deploy?). See: docker compose -f compose.prod.yml logs app"
fi
log "Rolling back: $image did not become healthy; starting $current again"
set_app_image "$ENV_FILE" "$current"
if compose up -d --wait --wait-timeout 300 --remove-orphans; then
  compose ps
  fail "Rolled back to $current, which is healthy. $image did not become healthy: see its logs with docker compose -f compose.prod.yml logs app. If its database migrations broke something, restore the newest 'pre-update' snapshot (backup/restore.sh list, then backup/restore.sh database <ID>)."
fi
compose ps
if [[ "$(app_health)" == healthy ]]; then
  others=$(compose ps --all --format '{{.Service}} {{.State}} {{.Health}}' | unhealthy_services)
  fail "Rolled back to $current, which is healthy; $image was not. ${others:-Another service} is not healthy either (see above): see docker compose -f compose.prod.yml logs ${others:-<service>}."
fi
fail "The rollback to $current did not become healthy either. Restore the newest 'pre-update' snapshot: backup/restore.sh list, then backup/restore.sh database <ID> (deploy/README.md, step 7)."
