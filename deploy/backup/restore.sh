#!/usr/bin/env bash
# Restore from the encrypted restic backups made by backup.sh (PLAN §18.2).
#
#   sudo ./restore.sh list                          # show the snapshots
#   sudo ./restore.sh test [SNAPSHOT] [DB]          # restore into a temporary, isolated PostgreSQL
#                                                   # and check it; changes nothing (monthly test)
#   sudo ./restore.sh database [SNAPSHOT] [DB]      # REPLACE the live database with the backup
#   sudo ./restore.sh config [SNAPSHOT] TARGET_DIR  # copy the backed-up settings into TARGET_DIR
#   sudo ./restore.sh carry DIR [DB]                # load rows a failed `database` kept in DIR
#
# SNAPSHOT is a snapshot ID from `list`, or `latest` (the default). DB defaults to gliagora.
# `database` asks for confirmation (or pass --yes as the last argument), takes a safety backup of
# the current database first, stops the app while restoring and starts it again afterwards. It
# keeps the live database's deletion log and data requests (see "Carried over" below).
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
usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

YES=false
args=()
for a in "$@"; do [[ "$a" == --yes ]] && YES=true || args+=("$a"); done
set -- "${args[@]+"${args[@]}"}"

command="${1:-}"
snapshot="${2:-latest}"
if [[ "$command" != carry ]]; then
  [[ "$snapshot" =~ ^(latest|[0-9a-f]{8,64})$ ]] || fail "SNAPSHOT must be 'latest' or a snapshot ID."
fi

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

# Carried over (M4b, D49; PLAN §18.2). A restore brings back everything deleted after the
# snapshot, and sets the ID sequences back. So `database` keeps two tables of the live database:
# the deletion log (record IDs only), which lists the deletions to repeat on the restored data, and
# the data requests, the record of what people asked and what was done. It copies their rows out
# (binary COPY, into a folder only root can read, since requests hold addresses) before the
# database is replaced, loads them back into the restored database, where they replace older
# copies of the same rows, and in the same transaction moves the ID sequences of those tables and
# of members, suggestions and reports past every ID carried over or named by the log: the next
# request or log row cannot collide with a carried row, and no new member, suggestion or report
# takes an ID the log names. If that fails, the app stays stopped and the folder stays for the
# administrator (`restore.sh carry DIR`). The column lists must match the tables:
# src/lib/access.test.ts compares them with the newest migration.
CARRY_COLUMNS_deletion_log='id, target_collection, target_id, action, at'
CARRY_COLUMNS_data_requests='id, kind, email, name, locale, details, action_note, outcome, status, action, source, received_at, respond_by, closed_at, purge_at, confirmation_sent_at, email_hash, updated_at, created_at'
CARRY_TABLES=(deletion_log data_requests)
# Tables whose ID sequence moves past the carried and logged IDs; the deletion log names records
# of the first three (its target_collection is the table's name).
SEQUENCE_TABLES=(members submissions reports data_requests deletion_log)

carry_columns() { local name="CARRY_COLUMNS_$1"; echo "${!name}"; }

# psql on the live database, as the superuser: live_psql DB [psql arguments...]
live_psql() { local db=$1; shift; compose exec -T db psql -U postgres -d "$db" -X -q -v ON_ERROR_STOP=1 "$@"; }

# Whether the database behind PSQL (a function or command, with its arguments) has a table.
has_table() { [[ "$("${@:1:$#-1}" -tAc "select to_regclass('public.${!#}') is not null")" == t ]]; }

# carry_save DIR PSQL...: copies the rows to keep and the sequences' values out of a database.
carry_save() {
  local dir=$1 table value
  shift
  : >"$dir/sequences"
  for table in "${CARRY_TABLES[@]}"; do
    has_table "$@" "$table" || continue
    "$@" -c "copy (select $(carry_columns "$table") from $table order by id) to stdout with (format binary)" >"$dir/$table.bin"
  done
  for table in "${SEQUENCE_TABLES[@]}"; do
    value=$("$@" -tAc "select coalesce((select last_value from pg_sequences where schemaname = 'public' and sequencename = '${table}_id_seq'), 0)")
    [[ "$value" =~ ^[0-9]+$ ]] || return 1
    echo "$table $value" >>"$dir/sequences"
  done
}

# carry_load DIR PSQL...: loads what carry_save kept into a database, in one transaction.
carry_load() {
  local dir=$1 table columns column updates live logged line sql='' sequences
  shift
  # Read first: the psql commands below would take the rest of the file as their input.
  mapfile -t sequences <"$dir/sequences"
  for table in "${CARRY_TABLES[@]}"; do
    [[ -f "$dir/$table.bin" ]] || continue
    if ! has_table "$@" "$table"; then
      log "ERROR: the restored database has no $table table (a backup from before M4b?)."
      return 1
    fi
    columns=$(carry_columns "$table")
    # A table of exactly these columns to load into (it does not survive the transaction below).
    "$@" -c "set client_min_messages = warning; drop table if exists restore_carry_$table; create table restore_carry_$table as select $columns from $table with no data" || return 1
    "$@" -c "copy restore_carry_$table ($columns) from stdin with (format binary)" <"$dir/$table.bin" || return 1
    updates=''
    for column in ${columns//,/ }; do
      [[ "$column" == id ]] || updates+="${updates:+, }$column = excluded.$column"
    done
    sql+="insert into $table ($columns) select $columns from restore_carry_$table
  on conflict (id) do update set $updates;
drop table restore_carry_$table;
"
  done
  for line in "${sequences[@]}"; do
    read -r table live <<<"$line"
    [[ "$live" =~ ^[0-9]+$ ]] || return 1
    has_table "$@" "$table" || continue
    logged=0
    if has_table "$@" deletion_log && [[ "$table" =~ ^(members|submissions|reports)$ ]]; then
      logged="(select coalesce(max(target_id), 0)::bigint from deletion_log where target_collection = '$table')"
    fi
    sql+="select setval('public.${table}_id_seq', greatest(1, (select last_value from public.${table}_id_seq), $live, (select coalesce(max(id), 0) from $table), $logged));
"
  done
  "$@" <<<"\\o /dev/null
begin;
$sql
commit;"
}

# Reports what a carried-over database holds: the carried counts and the sequences' values.
carry_report() {
  local table
  for table in "${SEQUENCE_TABLES[@]}"; do
    has_table "$@" "$table" || continue
    log "  $table: $("$@" -tAc "select count(*) from $table") rows, next ID after $("$@" -tAc "select last_value from public.${table}_id_seq")"
  done
}

# A new log row and a new request can be stored after the carry-over (their IDs are free).
carry_check_inserts() {
  local tables=0
  has_table "$@" deletion_log && tables=$((tables + 1))
  has_table "$@" data_requests && tables=$((tables + 1))
  [[ $tables -eq 2 ]] || return 0
  "$@" <<<"begin;
insert into deletion_log (target_collection, target_id, action, at) values ('members', 0, 'delete', now());
insert into data_requests (kind, status, source, locale, email) values ('other', 'new', 'email', 'en', 'restore-test@example.org');
rollback;"
}

# A folder for carried rows that only root can read (requests hold addresses and details).
carry_dir() { (umask 077 && mktemp -d /root/gliagora-restore-carry.XXXXXX); }

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
    # The carry-over of `database`, from the live database into the restored copy (read-only on
    # the live side): the counts, the sequences, and that new rows can be stored afterwards.
    if has_table live_psql "$db" deletion_log || has_table live_psql "$db" data_requests; then
      carry=$(carry_dir)
      trap 'docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$carry"' EXIT
      log "Carrying the live deletion log and data requests over"
      carry_save "$carry" live_psql "$db" || fail "Could not copy the rows to carry over."
      carry_load "$carry" docker exec -i "$name" psql -U postgres -d restore_test -X -q -v ON_ERROR_STOP=1 \
        || fail "Could not load the carried rows into the restored copy."
      carry_report docker exec -i "$name" psql -U postgres -d restore_test -X -q -v ON_ERROR_STOP=1
      carry_check_inserts docker exec -i "$name" psql -U postgres -d restore_test -X -q -v ON_ERROR_STOP=1 \
        || fail "After the carry-over, a new deletion-log row or data request could not be stored."
    fi
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
    carry=$(carry_dir)
    log "Copying the live deletion log and data requests out (to $carry)"
    if ! carry_save "$carry" live_psql "$db"; then
      compose up -d --wait app
      fail "Could not copy the rows to carry over. Nothing was changed; the app is running again."
    fi
    log "Recreating database $db"
    compose exec -T db dropdb -U postgres --if-exists --force "$db"
    compose exec -T db createdb -U postgres --owner "$db" "$db"
    log "Restoring $db from snapshot ${snapshot:0:8}"
    if ! dump_database "$db" \
      | compose exec -T db pg_restore -U postgres -d "$db" --no-owner --role "$db" --exit-on-error; then
      fail "Restore failed. The app is stopped. The state before this restore is in the newest \
'pre-restore' snapshot: run '$0 database <its ID> $db' to go back. The rows to carry over are in $carry."
    fi
    log "Loading the carried rows back and moving the ID sequences"
    if ! carry_load "$carry" live_psql "$db"; then
      fail "Carrying the deletion log and data requests over failed. The app is stopped, and the \
rows are kept in $carry: fix the cause, then run '$0 carry $carry $db', which starts the app."
    fi
    carry_report live_psql "$db"
    rm -rf "$carry"
    log "Starting the app"
    compose up -d --wait app
    log "Restore finished."
    ;;

  carry)
    carry="${2:-}"
    db="${3:-gliagora}"
    [[ -d "$carry" && -f "$carry/sequences" ]] || usage
    log "Stopping the app"
    compose stop app
    carry_load "$carry" live_psql "$db" || fail "Carrying over failed again. The app is stopped; \
the rows are still in $carry."
    carry_report live_psql "$db"
    rm -rf "$carry"
    log "Starting the app"
    compose up -d --wait app
    log "Carry-over finished."
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
