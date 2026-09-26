#!/usr/bin/env bash
# Update the site to the image named by APP_IMAGE in .env (PLAN §11.5):
#   1. takes an encrypted backup (tag: pre-update), because the new version may migrate the database;
#   2. pulls the image;
#   3. restarts the stack and waits until every service reports healthy.
#
#   sudo /opt/gliagora/update.sh --no-pull   # use images already on the server (the deploy
#                                            # workflow pulls them first; also for a rollback)
#   sudo /opt/gliagora/update.sh             # pull too (works only for public images, because
#                                            # the server keeps no registry login, D27)
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compose() { docker compose --project-directory "$APP_DIR" -f "$APP_DIR/compose.prod.yml" "$@"; }
log() { echo "[$(date -u +%FT%TZ)] $*"; }

# First start = no database volume yet. Otherwise the database is started if needed and backed
# up; if that fails, the update stops here, before any migration.
project="${COMPOSE_PROJECT_NAME:-$(sed -n 's/^name: *//p' "$APP_DIR/compose.prod.yml")}"
if docker volume inspect "${project}_db-data" >/dev/null 2>&1; then
  log "1/3 Backup before the update"
  compose up -d --wait db
  "$APP_DIR/backup/backup.sh" pre-update
else
  log "1/3 No database volume yet (first start): nothing to back up"
fi

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
To roll back: run the Deploy workflow (GitHub → Actions → Deploy) with the previous sha- tag, or,
without GitHub, `cp .env.previous .env && sudo ./update.sh --no-pull` (the previous image is still
on the server; the server keeps no registry login, D27). If a migration damaged data, restore the
newest 'pre-update' snapshot with `backup/restore.sh database <snapshot-id>` (see `restore.sh list`).
MSG
  exit 1
fi
compose ps
log "Update finished"
