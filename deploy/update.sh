#!/usr/bin/env bash
# Update the site to the image named by APP_IMAGE in .env (PLAN §11.5):
#   1. takes an encrypted backup (tag: pre-update), because the new version may migrate the database;
#   2. pulls the image;
#   3. restarts the stack and waits until every service reports healthy.
#
#   sudo /opt/gliagora/update.sh             # normal update
#   sudo /opt/gliagora/update.sh --no-pull   # use images already on the server (e.g. a rollback)
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compose() { docker compose --project-directory "$APP_DIR" -f "$APP_DIR/compose.prod.yml" "$@"; }
log() { echo "[$(date -u +%FT%TZ)] $*"; }

log "1/3 Backup before the update"
"$APP_DIR/backup/backup.sh" pre-update

if [[ "${1:-}" != --no-pull ]]; then
  log "2/3 Pulling images"
  compose pull
else
  log "2/3 Skipping pull (--no-pull)"
fi

log "3/3 Restarting"
if ! compose up -d --wait --remove-orphans; then
  compose ps
  cat >&2 <<'MSG'

The update did not become healthy. Check `docker compose -f compose.prod.yml logs app`.
To roll back: set APP_IMAGE in .env to the previous ghcr.io/...:sha-<commit> tag and run
`update.sh --no-pull`. If a migration damaged data, restore the newest 'pre-update' snapshot with
`backup/restore.sh database <snapshot-id>` (see `backup/restore.sh list`).
MSG
  exit 1
fi
compose ps
log "Update finished"
