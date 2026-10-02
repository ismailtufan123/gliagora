#!/usr/bin/env bash
# Update the site to the image named by APP_IMAGE in .env (PLAN §11.5):
#   1. starts the database and takes an encrypted backup (tag: pre-update), because the new version
#      may migrate the database (skipped only on the very first start, when there is nothing yet);
#   2. pulls the images;
#   3. prepares listmonk (listmonk/prepare.sh: its database, its install and schema, its settings),
#      when compose.prod.yml has it (M2, D50);
#   4. restarts the stack and waits (at most 5 minutes) until every service reports healthy.
#
#   sudo /opt/gliagora/update.sh --no-pull   # use images already on the server (the deploy
#                                            # workflow pulls the app's first; also for a rollback)
#   sudo /opt/gliagora/update.sh             # pull too (works only for public images, because
#                                            # the server keeps no registry login, D27)
# Runs as root (the backup repository is root's). The Deploy workflow runs it through
# deploy-remote.sh, which also rolls back by itself when the new image does not become healthy.
# Images that are missing (a new listmonk, say) are pulled when they are first needed, also with
# --no-pull: they are public.
set -euo pipefail

APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
compose() { docker compose --project-directory "$APP_DIR" -f "$APP_DIR/compose.prod.yml" "$@"; }
log() { echo "[$(date -u +%FT%TZ)] $*"; }

# First start = no database volume yet: nothing to back up. Otherwise the database is started (or
# recreated, when its settings changed) and backed up; if that fails, the update stops here,
# before any migration.
project="${COMPOSE_PROJECT_NAME:-$(sed -n 's/^name: *//p' "$APP_DIR/compose.prod.yml")}"
had_database=false
docker volume inspect "${project}_db-data" >/dev/null 2>&1 && had_database=true
log "1/4 Starting the database"
compose up -d --wait db
if [[ "$had_database" == true ]]; then
  log "1/4 Backup before the update"
  "$APP_DIR/backup/backup.sh" pre-update
else
  log "1/4 No database volume before (first start): nothing to back up"
fi

if [[ "${1:-}" != --no-pull ]]; then
  log "2/4 Pulling images"
  compose pull
else
  log "2/4 Skipping pull (--no-pull)"
fi

# Read in full first: `grep -q` may stop reading early, which pipefail would count as a failure.
services=$(compose config --services)
if grep -qx listmonk <<<"$services"; then
  log "3/4 Preparing listmonk"
  "$APP_DIR/listmonk/prepare.sh"
else
  log "3/4 No listmonk in compose.prod.yml"
fi

log "4/4 Restarting"
if ! compose up -d --wait --wait-timeout 300 --remove-orphans; then
  compose ps
  cat >&2 <<'MSG'

The update did not become healthy (the list above shows which service). Check its logs with
`docker compose -f compose.prod.yml logs <service>`. A deploy from the Deploy workflow now switches
back to the previous image by itself, unless the app itself is healthy. After a manual update, roll
the app back to the image that ran before the last deploy (still on the server; the server keeps no
registry login, D27) by setting only APP_IMAGE in .env (README.md, step 6), then run
`sudo ./update.sh --no-pull`; or run the Deploy workflow (GitHub → Actions → Deploy) with the
previous sha- tag. If a migration damaged data, restore the newest 'pre-update' snapshot with
`backup/restore.sh database <snapshot-id>` (see `restore.sh list`).
MSG
  exit 1
fi
compose ps
log "Update finished"
