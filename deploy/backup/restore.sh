#!/usr/bin/env bash
# Restore from the encrypted restic backups made by backup.sh (PLAN §18.2).
#
#   sudo ./restore.sh list                          # show the snapshots
#   sudo ./restore.sh test [SNAPSHOT] [DB]          # restore into a temporary, isolated PostgreSQL
#                                                   # and check it; changes nothing (monthly test)
#   sudo ./restore.sh database [SNAPSHOT] [DB]      # REPLACE the live database with the backup
#   sudo ./restore.sh config [SNAPSHOT] TARGET_DIR  # copy the backed-up settings into TARGET_DIR
#
# SNAPSHOT is a snapshot ID from `list`, or `latest` (the default). DB defaults to gliagora.
# `database` asks for confirmation (or pass --yes as the last argument), takes a safety backup of
# the current database first, stops the app while restoring and starts it again afterwards.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CONFIG="${BACKUP_CONFIG:-$SCRIPT_DIR/backup.env}"
[[ -r "$CONFIG" ]] || { echo "ERROR: $CONFIG not found (copy backup.env.example)." >&2; exit 1; }
set -a
# shellcheck source=/dev/null
. "$CONFIG"
set +a
: "${COMPOSE_DIR:?}" "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"

HOST_TAG=gliagora

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
compose() { docker compose --project-directory "$COMPOSE_DIR" -f "$COMPOSE_DIR/compose.prod.yml" "$@"; }
usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

YES=false
args=()
for a in "$@"; do [[ "$a" == --yes ]] && YES=true || args+=("$a"); done
set -- "${args[@]+"${args[@]}"}"

command="${1:-}"
snapshot="${2:-latest}"
[[ "$snapshot" =~ ^(latest|[0-9a-f]{8,64})$ ]] || fail "SNAPSHOT must be 'latest' or a snapshot ID."

# Turns "latest" into the ID of the newest snapshot with the given tag, so that later backups
# (such as the safety backup before a restore) cannot change which snapshot is used.
resolve_snapshot() {
  local tag=$1 id
  if [[ "$snapshot" == latest ]]; then
    id=$(restic snapshots --host "$HOST_TAG" --tag "$tag" --latest 1 --json \
      | grep -o '"id":"[0-9a-f]\{64\}"' | tail -n 1 | cut -d'"' -f4)
    [[ -n "$id" ]] || fail "No snapshot with tag $tag."
    snapshot=$id
  fi
}

# Checks that the snapshot contains the dump of this database.
require_dump() {
  local db=$1
  restic ls "$snapshot" "/$db.dump" >/dev/null 2>&1 || fail "Snapshot $snapshot has no dump of $db."
}

# Writes the database dump from the snapshot to stdout.
dump_database() {
  restic dump "$snapshot" "/$1.dump"
}

describe_snapshot() {
  restic snapshots --compact "$snapshot"
}

case "$command" in
  list)
    restic snapshots --host "$HOST_TAG" --compact
    ;;

  test)
    db="${3:-gliagora}"
    # Same PostgreSQL image as production, without a network, removed afterwards.
    image=$(compose config --images | grep -m1 '^postgres') || fail "No PostgreSQL image in compose.prod.yml."
    name="gliagora-restore-test-$$"
    trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
    log "Starting a temporary PostgreSQL ($image)"
    docker run -d --name "$name" --network none -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
      "$image" >/dev/null
    # Wait over TCP: during first-start initialisation the image runs a temporary server that only
    # listens on a local socket, so TCP answers only once the real server is up.
    ready=false
    for _ in $(seq 1 90); do
      docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -q && ready=true && break
      sleep 1
    done
    [[ "$ready" == true ]] || fail "The temporary PostgreSQL did not start."
    resolve_snapshot "db:$db"
    require_dump "$db"
    describe_snapshot
    log "Restoring $db into the temporary PostgreSQL"
    docker exec "$name" createdb -U postgres restore_test
    dump_database "$db" \
      | docker exec -i "$name" pg_restore -U postgres -d restore_test --no-owner --exit-on-error
    tables=$(docker exec "$name" psql -U postgres -d restore_test -tAc \
      "select count(*) from information_schema.tables where table_schema = 'public'")
    migrations=$(docker exec "$name" psql -U postgres -d restore_test -tAc \
      "select count(*) from payload_migrations" 2>/dev/null || echo 0)
    [[ "$tables" -gt 0 ]] || fail "The restored database has no tables."
    [[ "$db" != gliagora || "$migrations" -gt 0 ]] || fail "The restored database has no migrations."
    log "Restore test passed: $tables tables, $migrations migrations."
    ;;

  database)
    db="${3:-gliagora}"
    resolve_snapshot "db:$db"
    require_dump "$db"
    describe_snapshot
    echo
    echo "This REPLACES the live database '$db' with the snapshot above."
    echo "A safety backup of the current database is taken first (tag: pre-restore)."
    if [[ "$YES" != true ]]; then
      read -r -p "Type the database name ($db) to continue: " answer
      [[ "$answer" == "$db" ]] || fail "Cancelled."
    fi
    log "Safety backup of the current state"
    "$SCRIPT_DIR/backup.sh" pre-restore
    require_dump "$db"
    log "Stopping the app"
    compose stop app
    log "Recreating database $db"
    compose exec -T db dropdb -U postgres --if-exists --force "$db"
    compose exec -T db createdb -U postgres --owner "$db" "$db"
    log "Restoring $db from snapshot ${snapshot:0:8}"
    if ! dump_database "$db" \
      | compose exec -T db pg_restore -U postgres -d "$db" --no-owner --role "$db" --exit-on-error; then
      fail "Restore failed. The app is stopped. The state before this restore is in the newest \
'pre-restore' snapshot: run '$0 database <its ID> $db' to go back."
    fi
    log "Starting the app"
    compose up -d --wait app
    log "Restore finished."
    ;;

  config)
    target="${3:-}"
    [[ -n "$target" ]] || usage
    [[ ! -e "$target" ]] || fail "$target already exists; choose a new folder."
    resolve_snapshot config
    restic restore "$snapshot" --target "$target"
    log "Settings restored under $target (compare them before copying anything back)."
    ;;

  *)
    usage
    ;;
esac
