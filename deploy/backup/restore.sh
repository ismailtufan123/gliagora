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
# SNAPSHOT is a snapshot ID from `list`, or `latest` (the default): the newest one, and for
# `database` the newest that is not the safety backup of a restore (tag pre-restore). Each database
# has snapshots of its own (the app's gliagora, listmonk's listmonk); DB is one of them. `test
# latest` without DB tests every database in DATABASES (backup.env), each in a fresh container of
# its own; otherwise, and for `database`, DB defaults to the one a snapshot ID holds, or to
# gliagora with `latest`.
# `database` asks for confirmation (or pass --yes as the last argument), takes a safety backup of
# the current databases first, stops the service that uses the database (the app, or listmonk)
# while restoring and starts it again afterwards. For the app's database it keeps the live
# database's deletion log and data requests (see "Carried over" below). Restore both databases
# from the same night (deploy/README.md, step 7).
set -euo pipefail

HOST_TAG=gliagora

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
compose() { docker compose --project-directory "$COMPOSE_DIR" -f "$COMPOSE_DIR/compose.prod.yml" "$@"; }
# The comment block at the top of this file, without its "# ".
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 1; }

# The ID of the newest snapshot with tag $1, passing over those also tagged $2 (if given); empty
# when there is none. Newest by each snapshot's own time, whatever order restic lists them in.
newest_snapshot() {
  local tag=$1 skip=${2:-} json line time='' tags='' at newest='' newest_at=-1
  json=$(restic snapshots --host "$HOST_TAG" --tag "$tag" --json) || return 1
  while IFS= read -r line; do
    case $line in
      '"time":'*) time=${line:8:-1} ;;
      '"tags":'*) tags=$line ;;
      '"id":'*)
        if [[ -n "$time" && ( -z "$skip" || "$tags" != *"\"$skip\""* ) ]]; then
          at=$(date -u -d "$time" +%s%N) || return 1
          if ((at > newest_at)); then newest_at=$at newest=${line:6:64}; fi
        fi
        time='' tags=''
        ;;
    esac
  done < <(grep -oE '"time":"[^"]+"|"tags":\[[^]]*\]|"id":"[0-9a-f]{64}"' <<<"$json" || true)
  echo "$newest"
}

# Turns "latest" into the ID of the newest snapshot with the given tag, so that later backups
# (such as the safety backup before a restore) cannot change which snapshot is used. `database`
# passes over the safety backups of earlier restores (tag pre-restore, its second argument):
# otherwise, after restoring one database, `database latest` of the other would pick the state
# that restore's safety backup just stored (on a new server: its empty database). It keeps
# pre-update snapshots: the newest one can be the one to restore.
resolve_snapshot() {
  local tag=$1 skip=${2:-} id
  if [[ "$snapshot" == latest ]]; then
    id=$(newest_snapshot "$tag" "$skip") || fail "Could not list the snapshots with tag $tag."
    [[ -n "$id" ]] || fail "No snapshot with tag $tag${skip:+ (other than $skip)}."
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

# The database whose dump a snapshot holds (its tag db:<name>), for a snapshot ID given alone.
snapshot_database() {
  local db
  db=$(restic snapshots --json "$snapshot" | grep -o '"db:[a-z0-9_]*"' | head -n 1 | tr -d '"')
  [[ -n "$db" ]] || return 1
  echo "${db#db:}"
}

# The service that uses a database: stopped while its database is replaced.
service_of() {
  case $1 in
    gliagora) echo app ;;
    listmonk) echo listmonk ;;
    *) return 1 ;;
  esac
}

# A query that counts a restored database's record of its schema migrations: more than none shows
# that it is a database of its kind, ready for its service. Empty for a database without one.
migration_query() {
  case $1 in
    gliagora) echo 'select count(*) from payload_migrations' ;;
    listmonk) echo "select count(*) from settings where key = 'migrations'" ;;
  esac
}

# Carried over (M4b, D49; PLAN §18.2), for the app's database only. A restore brings back
# everything deleted after the snapshot, and sets the ID sequences back. So `database` keeps two
# tables of the live database:
# the deletion log (record IDs only), which lists the deletions to repeat on the restored data, and
# the data requests, the record of what people asked and what was done. It copies their rows out
# (binary COPY, into a folder only root can read, since requests hold addresses) before the
# database is replaced, loads them back into the restored database, where they replace older
# copies of the same rows, and in the same transaction moves the ID sequences of those tables and
# of members, suggestions and reports past every ID carried over or named by the log: the next
# request or log row cannot collide with a carried row, and no new member, suggestion or report
# takes an ID the log names. If that fails, the app stays stopped and the folder stays for the
# administrator (`restore.sh carry DIR`). The column lists must match the tables:
# src/lib/access.test.ts compares them with the newest migration, and src/lib/restore-carry.test.ts
# runs these functions against a stand-in for psql.
#
# The carry functions run inside conditions (`if !`, `||`), where bash ignores `set -e`, so every
# step checks its own result: a copy that failed must never let the live database be dropped.
CARRY_COLUMNS_deletion_log='id, target_collection, target_id, action, at'
CARRY_COLUMNS_data_requests='id, kind, email, name, locale, details, action_note, outcome, status, action, source, received_at, respond_by, closed_at, purge_at, confirmation_sent_at, email_hash, updated_at, created_at'
CARRY_TABLES=(deletion_log data_requests)
# Tables whose ID sequence moves past the carried and logged IDs; the deletion log names records
# of the first three (its target_collection is the table's name).
SEQUENCE_TABLES=(members submissions reports data_requests deletion_log)
# What carry_load returns when the restored database lacks a carried table that has rows to take
# (a backup from before M4b): the app's migrations make the table when it starts (`carry`).
CARRY_NEEDS_TABLES=3

carry_columns() { local name="CARRY_COLUMNS_$1"; echo "${!name}"; }

# psql on the live database, as the superuser: live_psql DB [psql arguments...]
live_psql() { local db=$1; shift; compose exec -T db psql -U postgres -d "$db" -X -q -v ON_ERROR_STOP=1 "$@"; }

# Whether the database behind PSQL (a function or command, with its arguments) has a table:
# 0 yes, 1 no, 2 the question failed (never read as "no").
has_table() {
  local answer
  answer=$("${@:1:$#-1}" -tAc "select to_regclass('public.${!#}') is not null") || return 2
  case "$answer" in
    t) return 0 ;;
    f) return 1 ;;
    *) return 2 ;;
  esac
}

# Whether FILE is a binary COPY file: it starts with PGCOPY\n\377\r\n\0, even for an empty table.
is_pgcopy() { [[ "$(head -c 11 "$1" | od -An -tx1 | tr -d ' \n')" == 5047434f50590aff0d0a00 ]]; }

# Whether a binary COPY file holds a row: without one it is the 19-byte header (PostgreSQL writes
# no header extension) and the 2-byte trailer. A longer header would count as rows: the safe side.
pgcopy_has_rows() { [[ $(wc -c <"$1") -gt 21 ]]; }

# carry_save DIR PSQL...: copies the rows to keep and the sequences' values out of a database.
carry_save() {
  local dir=$1 table value found
  shift
  : >"$dir/sequences" || return 1
  for table in "${CARRY_TABLES[@]}"; do
    found=0
    has_table "$@" "$table" || found=$?
    if [[ $found -eq 1 ]]; then continue; fi
    if [[ $found -ne 0 ]]; then
      log "ERROR: could not tell whether the database has a $table table."
      return 1
    fi
    if ! "$@" -c "copy (select $(carry_columns "$table") from $table order by id) to stdout with (format binary)" >"$dir/$table.bin"; then
      log "ERROR: could not copy the $table rows."
      return 1
    fi
    if ! is_pgcopy "$dir/$table.bin"; then
      log "ERROR: the copy of the $table rows is not a binary COPY file."
      return 1
    fi
  done
  for table in "${SEQUENCE_TABLES[@]}"; do
    value=$("$@" -tAc "select coalesce((select last_value from pg_sequences where schemaname = 'public' and sequencename = '${table}_id_seq'), 0)") || return 1
    [[ "$value" =~ ^[0-9]+$ ]] || return 1
    echo "$table $value" >>"$dir/sequences" || return 1
  done
}

# carry_load DIR PSQL...: loads what carry_save kept into a database, in one transaction. Returns
# CARRY_NEEDS_TABLES, before changing anything, when the database lacks a table that has rows to
# take; skips one that had none; returns 1 on any other failure.
carry_load() {
  local dir=$1 table columns column updates live logged line found sql='' sequences load=() missing=()
  shift
  # Read first: the psql commands below would take the rest of the file as their input.
  mapfile -t sequences <"$dir/sequences" || return 1
  for table in "${CARRY_TABLES[@]}"; do
    [[ -f "$dir/$table.bin" ]] || continue
    if ! is_pgcopy "$dir/$table.bin"; then
      log "ERROR: $dir/$table.bin is not a binary COPY file."
      return 1
    fi
    found=0
    has_table "$@" "$table" || found=$?
    if [[ $found -eq 0 ]]; then
      load+=("$table")
    elif [[ $found -eq 1 ]] && ! pgcopy_has_rows "$dir/$table.bin"; then
      log "The restored database has no $table table (a backup from before M4b); nothing to carry."
    elif [[ $found -eq 1 ]]; then
      missing+=("$table")
    else
      log "ERROR: could not tell whether the restored database has a $table table."
      return 1
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log "ERROR: the restored database is from before M4b and has no ${missing[*]} table, but the live database had rows in it."
    return "$CARRY_NEEDS_TABLES"
  fi
  for table in "${load[@]}"; do
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
    read -r table live <<<"$line" || return 1
    [[ "$live" =~ ^[0-9]+$ ]] || return 1
    found=0
    has_table "$@" "$table" || found=$?
    if [[ $found -eq 1 ]]; then continue; fi
    [[ $found -eq 0 ]] || return 1
    logged=0
    if [[ "$table" =~ ^(members|submissions|reports)$ ]]; then
      found=0
      has_table "$@" deletion_log || found=$?
      if [[ $found -eq 0 ]]; then
        logged="(select coalesce(max(target_id), 0)::bigint from deletion_log where target_collection = '$table')"
      elif [[ $found -ne 1 ]]; then
        return 1
      fi
    fi
    sql+="select setval('public.${table}_id_seq', greatest(1, (select last_value from public.${table}_id_seq), $live, (select coalesce(max(id), 0) from $table), $logged));
"
  done
  "$@" <<<"\\o /dev/null
begin;
$sql
commit;" || return 1
}

# Reports what a carried-over database holds: the carried counts and the sequences' values.
carry_report() {
  local table found rows next
  for table in "${SEQUENCE_TABLES[@]}"; do
    found=0
    has_table "$@" "$table" || found=$?
    if [[ $found -eq 1 ]]; then continue; fi
    [[ $found -eq 0 ]] || return 1
    rows=$("$@" -tAc "select count(*) from $table") || return 1
    next=$("$@" -tAc "select last_value from public.${table}_id_seq") || return 1
    log "  $table: $rows rows, next ID after $next"
  done
}

# A new log row and a new request can be stored after the carry-over (their IDs are free). A
# database without both tables (from before M4b) has nothing to check.
carry_check_inserts() {
  local table found
  for table in deletion_log data_requests; do
    found=0
    has_table "$@" "$table" || found=$?
    if [[ $found -eq 1 ]]; then return 0; fi
    [[ $found -eq 0 ]] || return 1
  done
  "$@" <<<"begin;
insert into deletion_log (target_collection, target_id, action, at) values ('members', 0, 'delete', now());
insert into data_requests (kind, status, source, locale, email) values ('other', 'new', 'email', 'en', 'restore-test@example.org');
rollback;"
}

# A folder for carried rows that only root can read (requests hold addresses and details).
carry_dir() { (umask 077 && mktemp -d /root/gliagora-restore-carry.XXXXXX); }

# Sourced, as src/lib/restore-carry.test.ts does: the functions above only.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CONFIG="${BACKUP_CONFIG:-$SCRIPT_DIR/backup.env}"
[[ -r "$CONFIG" ]] || { echo "ERROR: $CONFIG not found (copy backup.env.example)." >&2; exit 1; }
set -a
# shellcheck source=/dev/null
. "$CONFIG"
set +a
: "${COMPOSE_DIR:?}" "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"

YES=false
args=()
for a in "$@"; do [[ "$a" == --yes ]] && YES=true || args+=("$a"); done
set -- "${args[@]+"${args[@]}"}"

command="${1:-}"
snapshot="${2:-latest}"
if [[ "$command" != carry ]]; then
  [[ "$snapshot" =~ ^(latest|[0-9a-f]{8,64})$ ]] || fail "SNAPSHOT must be 'latest' or a snapshot ID."
fi

# Where the rows of a failed carry-over are also kept.
PRE_RESTORE="The state before this restore, these rows included, is also in the newest 'pre-restore' snapshot ('$0 list')."

case "$command" in
  list)
    restic snapshots --host "$HOST_TAG" --compact
    ;;

  test)
    db="${3:-}"
    if [[ -z "$db" && "$snapshot" == latest ]]; then
      # Every database, each by a run of its own, so that each has a fresh container and its own
      # clean-up, and a failure of one does not hide the others.
      : "${DATABASES:?Set DATABASES in $CONFIG}"
      failed=()
      for db in $DATABASES; do
        "${BASH_SOURCE[0]}" test latest "$db" || failed+=("$db")
      done
      [[ ${#failed[@]} -eq 0 ]] || fail "The restore test failed for: ${failed[*]} (see above)."
      log "Restore tests passed: $DATABASES."
      exit 0
    fi
    [[ -n "$db" ]] || db=$(snapshot_database) || fail "Snapshot $snapshot holds no database dump."
    # Same PostgreSQL image as production, without a network, removed afterwards with its data
    # (`-v`: the image declares a volume, which would otherwise stay behind with a full copy).
    images=$(compose config --images) || fail "Could not read compose.prod.yml."
    image=$(grep -m1 '^postgres' <<<"$images") || fail "No PostgreSQL image in compose.prod.yml."
    name="gliagora-restore-test-$$"
    trap 'docker rm -f -v "$name" >/dev/null 2>&1 || true' EXIT
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
    [[ "$tables" -gt 0 ]] || fail "The restored database has no tables."
    migrations=0
    query=$(migration_query "$db")
    if [[ -n "$query" ]]; then
      migrations=$(docker exec "$name" psql -U postgres -d restore_test -tAc "$query" 2>/dev/null || echo 0)
      [[ "$migrations" -gt 0 ]] || fail "The restored database has no migrations."
    fi
    # The carry-over of `database`, from the live database into the restored copy (read-only on
    # the live side): the counts, the sequences, and that new rows can be stored afterwards.
    carried=false
    if [[ "$db" == gliagora ]]; then
      for table in "${CARRY_TABLES[@]}"; do
        found=0
        has_table live_psql "$db" "$table" || found=$?
        [[ $found -le 1 ]] || fail "Could not read the live database $db."
        [[ $found -eq 1 ]] || carried=true
      done
    fi
    if [[ "$carried" == true ]]; then
      carry=$(carry_dir)
      trap 'docker rm -f -v "$name" >/dev/null 2>&1 || true; rm -rf "$carry"' EXIT
      restored=(docker exec -i "$name" psql -U postgres -d restore_test -X -q -v ON_ERROR_STOP=1)
      log "Carrying the live deletion log and data requests over"
      carry_save "$carry" live_psql "$db" || fail "Could not copy the rows to carry over."
      status=0
      carry_load "$carry" "${restored[@]}" || status=$?
      if [[ $status -eq $CARRY_NEEDS_TABLES ]]; then
        fail "The snapshot restores, but it is from before M4b, and the live database has rows for \
tables it lacks. A real restore of it would stop with the app stopped; 'restore.sh carry' would then \
finish it (deploy/README.md, section 7)."
      fi
      [[ $status -eq 0 ]] || fail "Could not load the carried rows into the restored copy."
      carry_report "${restored[@]}" || fail "Could not read the carried rows in the restored copy."
      carry_check_inserts "${restored[@]}" \
        || fail "After the carry-over, a new deletion-log row or data request could not be stored."
    fi
    log "Restore test passed: $db, $tables tables, $migrations migrations."
    ;;

  database)
    db="${3:-}"
    if [[ -z "$db" ]]; then
      if [[ "$snapshot" == latest ]]; then db=gliagora; else db=$(snapshot_database) || fail "Snapshot $snapshot holds no database dump."; fi
    fi
    service=$(service_of "$db") || fail "No service is known to use the database $db."
    resolve_snapshot "db:$db" pre-restore
    require_dump "$db"
    describe_snapshot
    echo
    echo "This REPLACES the live database '$db' with the snapshot above."
    echo "A safety backup of the current databases is taken first (tag: pre-restore)."
    if [[ "$YES" != true ]]; then
      read -r -p "Type the database name ($db) to continue: " answer
      [[ "$answer" == "$db" ]] || fail "Cancelled."
    fi
    log "Safety backup of the current state"
    "$SCRIPT_DIR/backup.sh" pre-restore
    require_dump "$db"
    log "Stopping $service"
    compose stop "$service"
    if [[ "$db" == gliagora ]]; then
      carry=$(carry_dir)
      log "Copying the live deletion log and data requests out (to $carry)"
      if ! carry_save "$carry" live_psql "$db"; then
        rm -rf "$carry"
        compose up -d --wait "$service"
        fail "Could not copy the rows to carry over. Nothing was changed; the app is running again."
      fi
    fi
    log "Recreating database $db"
    compose exec -T db dropdb -U postgres --if-exists --force "$db"
    compose exec -T db createdb -U postgres --owner "$db" "$db"
    # A new database lets every role connect (PUBLIC), and pg_restore without --create does not
    # bring back the dump's own rule: take it away, as the init scripts do (postgres/init/), so
    # another app's role (listmonk's, say) cannot reach this database.
    compose exec -T db psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 \
      -c "REVOKE ALL ON DATABASE \"$db\" FROM PUBLIC" \
      || fail "Could not take PUBLIC's access to the new, still empty database $db away. $service \
is stopped. Run '$0 database $snapshot $db' again, or go back to the newest 'pre-restore' snapshot.\
${carry:+ The rows to carry over are in $carry.}"
    log "Restoring $db from snapshot ${snapshot:0:8}"
    if ! dump_database "$db" \
      | compose exec -T db pg_restore -U postgres -d "$db" --no-owner --role "$db" --exit-on-error; then
      fail "Restore failed. $service is stopped. The state before this restore is in the newest \
'pre-restore' snapshot: run '$0 database <its ID> $db' to go back.${carry:+ The rows to carry over are in $carry.}"
    fi
    if [[ "$db" == gliagora ]]; then
      log "Loading the carried rows back and moving the ID sequences"
      status=0
      carry_load "$carry" live_psql "$db" || status=$?
      if [[ $status -eq $CARRY_NEEDS_TABLES ]]; then
        fail "The snapshot is from before M4b: the live deletion log or data requests have rows, and \
the restored database has no table for them yet. The app is stopped, and the rows are kept in $carry. \
Run '$0 carry $carry $db' with an app image that includes M4b (the deployed one does, unless you went \
back to an older image: then deploy M4b again first, and keep $carry until then). It starts the app \
once, so that its migrations make the tables, stops it, loads the rows and starts the app. $PRE_RESTORE"
      elif [[ $status -ne 0 ]]; then
        fail "Carrying the deletion log and data requests over failed. The app is stopped, and the \
rows are kept in $carry: fix the cause, then run '$0 carry $carry $db', which starts the app. $PRE_RESTORE"
      fi
      carry_report live_psql "$db" || log "Could not report the carried rows (the carry-over itself is done)."
      rm -rf "$carry"
    fi
    if [[ "$db" == listmonk && -x "$COMPOSE_DIR/listmonk/prepare.sh" ]]; then
      # The snapshot holds listmonk's settings and API user as they were then: put the current
      # ones back (and its schema up to date) before it starts.
      log "Applying listmonk's current settings"
      "$COMPOSE_DIR/listmonk/prepare.sh" || fail "listmonk's settings could not be applied; listmonk is stopped. Run '$COMPOSE_DIR/listmonk/prepare.sh', then 'docker compose -f compose.prod.yml up -d listmonk'."
    fi
    log "Starting $service"
    compose up -d --wait "$service"
    log "Restore finished."
    ;;

  carry)
    carry="${2:-}"
    db="${3:-gliagora}"
    [[ -d "$carry" && -f "$carry/sequences" ]] || usage
    [[ "$db" == gliagora ]] || fail "Only the app's database (gliagora) carries rows over."
    log "Stopping the app"
    compose stop app
    status=0
    carry_load "$carry" live_psql "$db" || status=$?
    if [[ $status -eq $CARRY_NEEDS_TABLES ]]; then
      # A backup from before M4b: the app's migrations make the tables when it starts.
      log "Starting the app once, so that its migrations make the missing tables, then stopping it"
      compose up -d --wait app || fail "The app did not start. The rows are still in $carry. $PRE_RESTORE"
      compose stop app
      status=0
      carry_load "$carry" live_psql "$db" || status=$?
      [[ $status -ne $CARRY_NEEDS_TABLES ]] || fail "The app did not make the tables: its image is \
from before M4b. Deploy one with M4b, then run '$0 carry $carry $db' again. The app is stopped; the \
rows are still in $carry. $PRE_RESTORE"
    fi
    [[ $status -eq 0 ]] || fail "Carrying over failed again. The app is stopped; the rows are \
still in $carry. $PRE_RESTORE"
    carry_report live_psql "$db" || log "Could not report the carried rows (the carry-over itself is done)."
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
