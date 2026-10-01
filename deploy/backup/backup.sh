#!/usr/bin/env bash
# Encrypted backup of the Gliagora databases and server settings (PLAN §11.7.1, §18.2).
# Runs every night from gliagora-backup.timer, and before each update from update.sh.
#
#   sudo ./backup.sh init      # once: create the encrypted repository
#   sudo ./backup.sh [TAG]     # back up now; TAG defaults to "nightly"
#
# Every run:
#   1. Streams each database dump (pg_dump) straight into restic, which encrypts and deduplicates
#      it. No unencrypted dump is written to disk. The rows of form_limits (hashed IP addresses and
#      used spam-check answers, kept 24 hours in the app database only, D34) are left out; the
#      table itself is dumped, so a restore starts with empty form limits.
#   2. Adds the files needed to rebuild the server: .env, admin-auth.caddy, Compose files.
#      Never the map's basemap (/opt/gliagora/basemap, about 4 GB): it is downloaded again
#      (deploy/basemap/fetch-basemap.sh), so it stays out of the backups and of the weekly copy.
#      Keep the list in step 2 to these files; never add a whole folder such as /opt/gliagora.
# Nightly runs only (other tags, such as pre-update and pre-restore, never delete anything):
#   3. Keeps everything from the last 2 days plus 7 daily, 4 weekly and 6 monthly snapshots.
#   4. On Sundays, checks the repository for damage.
#   5. If COPY_REPOSITORY is set, copies the snapshots to that second repository.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CONFIG="${BACKUP_CONFIG:-$SCRIPT_DIR/backup.env}"
[[ -r "$CONFIG" ]] || { echo "ERROR: $CONFIG not found (copy backup.env.example)." >&2; exit 1; }
set -a
# shellcheck source=/dev/null
. "$CONFIG"
set +a
: "${COMPOSE_DIR:?}" "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}" "${DATABASES:?}"

HOST_TAG=gliagora   # fixed host name in snapshots, so they stay together after a server move
RETENTION=(--keep-within 2d --keep-daily 7 --keep-weekly 4 --keep-monthly 6)

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
compose() { docker compose --project-directory "$COMPOSE_DIR" -f "$COMPOSE_DIR/compose.prod.yml" "$@"; }

umask 077

if [[ "${1:-}" == init ]]; then
  [[ -s "$RESTIC_PASSWORD_FILE" ]] || fail "Put the repository password in $RESTIC_PASSWORD_FILE first."
  restic init
  log "Repository created. Store the password from $RESTIC_PASSWORD_FILE in the password manager."
  exit 0
fi

TAG="${1:-nightly}"
[[ "$TAG" =~ ^[a-z0-9-]+$ ]] || fail "TAG may only contain a-z, 0-9 and '-'."
restic cat config >/dev/null || fail "Cannot open the repository. Did you run '$0 init'?"

# 1. Databases
for db in $DATABASES; do
  log "Dumping database $db"
  out=$(mktemp)
  set +e
  # form_limits never goes into backups (D34, step 1); databases without it are not affected.
  compose exec -T db pg_dump -U postgres --format=custom --compress=0 \
    --exclude-table-data=public.form_limits "$db" \
    | restic backup --stdin --stdin-filename "$db.dump" --host "$HOST_TAG" \
      --tag "$TAG" --tag "db:$db" --json >"$out"
  status=("${PIPESTATUS[@]}")
  set -e
  snapshot=$(grep -o '"snapshot_id":"[0-9a-f]*"' "$out" | cut -d'"' -f4 || true)
  rm -f "$out"
  if [[ ${status[0]} -ne 0 ]]; then
    # restic stored whatever arrived before pg_dump failed; do not keep a partial dump.
    [[ -n "$snapshot" ]] && restic forget "$snapshot" >/dev/null
    fail "pg_dump failed for $db; no backup was kept for it."
  fi
  [[ ${status[1]} -eq 0 && -n "$snapshot" ]] || fail "restic could not store the dump of $db."
  log "Stored $db in snapshot ${snapshot:0:8}"
done

# 2. Settings needed to rebuild the server (never the repository password itself, never the
#    basemap): named one by one.
settings=()
for f in .env admin-auth.caddy compose.prod.yml Caddyfile postgres; do
  [[ -e "$COMPOSE_DIR/$f" ]] && settings+=("$COMPOSE_DIR/$f")
done
settings+=("$CONFIG")
log "Backing up settings"
restic backup --host "$HOST_TAG" --tag "$TAG" --tag config --quiet "${settings[@]}"

if [[ "$TAG" == nightly ]]; then
  # 3. Retention
  log "Applying retention (last 2 days, 7 daily, 4 weekly, 6 monthly)"
  restic forget --host "$HOST_TAG" "${RETENTION[@]}" --prune --quiet

  # 4. Weekly integrity check
  if [[ "$(date -u +%u)" == 7 ]]; then
    log "Checking repository integrity"
    restic check
  fi
fi

# 5. Optional second repository
if [[ "$TAG" == nightly && -n "${COPY_REPOSITORY:-}" ]]; then
  log "Copying snapshots to $COPY_REPOSITORY"
  restic -r "$COPY_REPOSITORY" --password-file "${COPY_PASSWORD_FILE:?}" copy \
    --from-repo "$RESTIC_REPOSITORY" --from-password-file "$RESTIC_PASSWORD_FILE" --host "$HOST_TAG"
  restic -r "$COPY_REPOSITORY" --password-file "$COPY_PASSWORD_FILE" forget \
    --host "$HOST_TAG" "${RETENTION[@]}" --prune --quiet
fi

if [[ -d "$RESTIC_REPOSITORY" ]]; then
  backup_root=$(dirname "$RESTIC_REPOSITORY")
  # Let the operator's account read the local (encrypted) repository for the weekly copy.
  if [[ -n "${BACKUP_READ_GROUP:-}" ]]; then
    chgrp "$BACKUP_READ_GROUP" "$backup_root"
    chmod g+rx "$backup_root"
    chgrp -R "$BACKUP_READ_GROUP" "$RESTIC_REPOSITORY"
    chmod -R g+rX,g-w "$RESTIC_REPOSITORY"
  fi
  date -u +%FT%TZ >"$backup_root/last-success"
  chmod 644 "$backup_root/last-success"
fi
log "Backup finished"
