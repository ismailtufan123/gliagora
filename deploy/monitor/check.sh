#!/usr/bin/env bash
# Checks the server every 15 minutes (PLAN §18.2, "Monitoring"; gliagora-monitor.timer) and fails
# when the operator should hear about something. systemd then emails this run's lines through
# backup/alert.sh, the path of the backup emails (ExecStopPost in gliagora-monitor.service), so
# these emails start with them: once SMTP_HOST and ALERT_EMAIL are set. Until then the journal
# keeps the lines (journalctl -u gliagora-monitor).
#
# What it checks:
#   - disk: a file system the site uses is at least 85% full, by space or by inodes;
#   - memory: less than 10% of the memory is available, or programs waited for memory during at
#     least 10% of the last five minutes (the kernel's pressure figures, where it has them);
#   - certificate: the certificate Caddy serves for the site, and for www., has less than a sixth
#     of its lifetime left (15 days of 90), or cannot be read. Caddy renews at a third (30 days of
#     90), so this means its renewal has failed for half of the time it had.
#
# No alert repeats every few minutes:
#   - a problem is reported once a second run sees it (a moment of low memory during a backup, or
#     Caddy restarting, is not one), then again once a day while it lasts;
#   - it counts as over only after four runs in a row without it (an hour), so one that comes and
#     goes is one problem, reported once a day; the journal says when it is over (no email);
#   - a report counts only once its email has gone: alert.sh says so (`--delivered`). While no
#     email can go (no mail server yet, or it refuses), the report stays due, the unit fails on
#     every run, and the first email that can go carries it;
#   - a failure of the check itself is emailed once a day at most (`--failure-reported`).
# What it has seen is in its state folder, one small file per problem: under /run, in memory, so
# that a full disk cannot keep the report about that disk from being remembered. A restart of the
# server forgets it; a problem that is still there is then reported again.
#
# Exit: 0 nothing to report now; 1 a report is due (the email); 2 the check itself failed (a line
# says why). It reads SITE_DOMAIN from /opt/gliagora/.env with alert.sh's own reader and prints
# no other setting. To see what it would say, without changing what it remembers:
#   sudo /opt/gliagora/monitor/check.sh --dry-run
# alert.sh alone uses the two other ways to call it:
#   check.sh --delivered STATUS    an email about a run that ended with STATUS has gone
#   check.sh --failure-reported    ends well when a failure of the check was emailed within a day
set -euo pipefail

MONITOR_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# The reader of .env (env_value) and trim, the same code that reads the mail settings.
# shellcheck source=../backup/alert.sh
source "$MONITOR_DIR/../backup/alert.sh"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

# The limits. The environment may set others (the unit file, a test).
DISK_MAX_PERCENT=${DISK_MAX_PERCENT:-85}
MEMORY_MIN_PERCENT=${MEMORY_MIN_PERCENT:-10}
MEMORY_PRESSURE_PERCENT=${MEMORY_PRESSURE_PERCENT:-10}
# A sixth of the certificate's lifetime.
CERT_MIN_LIFETIME_PARTS=${CERT_MIN_LIFETIME_PARTS:-6}
# A problem that lasts is reported again after this long.
REMIND_SECONDS=${REMIND_SECONDS:-86400}
# A problem is over after this many runs in a row without it (an hour).
OVER_RUNS=${OVER_RUNS:-4}

# A limit that is no whole number would switch its check off without a word.
limits_valid() {
  local name
  for name in DISK_MAX_PERCENT MEMORY_MIN_PERCENT MEMORY_PRESSURE_PERCENT CERT_MIN_LIFETIME_PARTS \
    REMIND_SECONDS OVER_RUNS; do
    [[ "${!name}" =~ ^[1-9][0-9]*$ ]] && continue
    echo "$name must be a whole number above 0" >&2
    return 1
  done
}

COMPOSE_DIR=${COMPOSE_DIR:-/opt/gliagora}
# The file systems of the site: the system, Docker's images and volumes (the databases), the
# backups, and the site's folder with the map's basemap. Each file system is checked once.
MONITOR_PATHS=${MONITOR_PATHS:-"/ /var/lib/docker /var/backups/gliagora $COMPOSE_DIR"}
MEMINFO=${MONITOR_MEMINFO:-/proc/meminfo}
PRESSURE=${MONITOR_PRESSURE:-/proc/pressure/memory}
TLS_ADDRESS=${MONITOR_TLS_ADDRESS:-127.0.0.1:443}

# What is wrong now: one "key<TAB>message" per problem. The key names its state file.
problems=()
# What is well, for the one line of a quiet run.
fine=()
problem() { problems+=("$1"$'\t'"$2"); }

# A name for a state file from a mount point or a host name: letters, digits, dots and hyphens.
key_part() { local s=${1//[^A-Za-z0-9.-]/-}; s=${s#-}; printf '%s' "${s:-root}"; }

# check_disk: space and inodes of each file system under MONITOR_PATHS.
check_disk() {
  local path line used mount seen=' ' free_kb
  for path in $MONITOR_PATHS; do
    # A folder that is not there (no backups yet) is skipped: df fails for it.
    line=$(df -Pk "$path" 2>/dev/null | awk 'NR == 2 { print $5, $4, $6 }') || continue
    read -r used free_kb mount <<<"$line"
    used=${used%\%}
    [[ "$used" =~ ^[0-9]+$ && "$seen" != *" $mount "* ]] || continue
    seen+="$mount "
    if (( used >= DISK_MAX_PERCENT )); then
      problem "disk-$(key_part "$mount")" \
        "disk: $mount is $used% full (limit $DISK_MAX_PERCENT%), $(( free_kb / 1024 )) MB free"
    else
      fine+=("disk $mount $used%")
    fi
    # Inodes: a file system can be full of small files while it has space. Some have no count.
    used=$(df -Pi "$path" 2>/dev/null | awk 'NR == 2 { print $5 }') || continue
    used=${used%\%}
    if [[ "$used" =~ ^[0-9]+$ ]] && (( used >= DISK_MAX_PERCENT )); then
      problem "inodes-$(key_part "$mount")" \
        "disk: $mount has used $used% of its file entries (inodes; limit $DISK_MAX_PERCENT%)"
    fi
  done
}

# check_memory: the memory that programs can still get, and how long they waited for some.
check_memory() {
  local total available percent pressure='' said=()
  total=$(awk '$1 == "MemTotal:" { print $2 }' "$MEMINFO" 2>/dev/null) || total=''
  available=$(awk '$1 == "MemAvailable:" { print $2 }' "$MEMINFO" 2>/dev/null) || available=''
  [[ "$total" =~ ^[1-9][0-9]*$ && "$available" =~ ^[0-9]+$ ]] \
    || { problem memory "memory: $MEMINFO could not be read"; return 0; }
  percent=$(( available * 100 / total ))
  (( percent < MEMORY_MIN_PERCENT )) && said+=("$percent% of the memory is available \
($(( available / 1024 )) of $(( total / 1024 )) MB; limit $MEMORY_MIN_PERCENT%)")
  # "some avg300": the share of the last five minutes in which a program waited for memory.
  if [[ -r "$PRESSURE" ]]; then
    pressure=$(awk '$1 == "some" { for (i = 2; i <= NF; i++) if ($i ~ /^avg300=/) { sub("avg300=", "", $i); print int($i) } }' "$PRESSURE" 2>/dev/null) || pressure=''
    [[ "$pressure" =~ ^[0-9]+$ ]] || pressure=''
    [[ -n "$pressure" ]] && (( pressure >= MEMORY_PRESSURE_PERCENT )) && said+=("programs waited \
for memory during $pressure% of the last five minutes (limit $MEMORY_PRESSURE_PERCENT%)")
  fi
  if (( ${#said[@]} > 0 )); then
    local message=${said[0]}
    (( ${#said[@]} > 1 )) && message+="; ${said[1]}"
    problem memory "memory: $message"
  else
    fine+=("memory $percent% available")
  fi
}

# The seconds since 1970 of an openssl date line ("notAfter=2026-12-29 09:59:59Z"), or nothing.
cert_date() {
  local value=${1#*=}
  [[ -z "$value" ]] || date -u -d "$value" +%s 2>/dev/null || true
}

# check_certificate HOST: the certificate Caddy serves for it, read from this computer.
check_certificate() {
  local host=$1 dates start end now=$NOW lifetime left key
  key="certificate-$(key_part "$host")"
  dates=$(timeout 20 openssl s_client -connect "$TLS_ADDRESS" -servername "$host" </dev/null 2>/dev/null \
    | openssl x509 -noout -startdate -enddate -dateopt iso_8601 2>/dev/null) || dates=''
  start=$(cert_date "$(grep '^notBefore=' <<<"$dates" || true)")
  end=$(cert_date "$(grep '^notAfter=' <<<"$dates" || true)")
  if [[ ! "$start" =~ ^[0-9]+$ || ! "$end" =~ ^[0-9]+$ ]] || (( end <= start )); then
    problem "$key" "certificate: the certificate for $host could not be read from Caddy \
($TLS_ADDRESS): is the site up?"
    return 0
  fi
  lifetime=$(( end - start )) left=$(( end - now ))
  if (( left <= 0 )); then
    problem "$key" "certificate: the certificate for $host ended on $(date -u -d "@$end" +%F): \
browsers refuse the site"
  elif (( left < lifetime / CERT_MIN_LIFETIME_PARTS )); then
    problem "$key" "certificate: the certificate for $host ends in $(( left / 86400 )) days, on \
$(date -u -d "@$end" +%F), and Caddy has not renewed it (see: docker compose -f compose.prod.yml logs caddy)"
  else
    fine+=("certificate $host $(( left / 86400 )) days")
  fi
}

# check_certificates: the site and its www. address (the Caddyfile serves both).
check_certificates() {
  local domain
  ENV_FILE="${MONITOR_ENV_FILE:-$COMPOSE_DIR/.env}"
  if [[ ! -r "$ENV_FILE" ]] || ! domain=$(env_value SITE_DOMAIN) || [[ -z "$(trim "$domain")" ]]; then
    problem certificate-setting "certificate: SITE_DOMAIN could not be read from $ENV_FILE"
    return 0
  fi
  domain=$(trim "$domain")
  # A host name and nothing else: a line that holds more (a second setting after a space) is
  # never printed.
  if [[ ! "$domain" =~ ^[A-Za-z0-9.-]+$ ]]; then
    problem certificate-setting "certificate: SITE_DOMAIN in $ENV_FILE is no host name"
    return 0
  fi
  check_certificate "$domain"
  check_certificate "www.$domain"
}

fatal() {
  log "ERROR: $*"
  exit 2
}

# A problem's record in the state folder, a file named by its key: "FIRST DELIVERED CLEAR" (when
# it was first seen; when an email about it last went out, 0: never; the runs in a row without it).
# read_record KEY sets first, delivered and clear, and fails without a record it can read.
read_record() {
  local file="$STATE_DIR/$1"
  first='' delivered='' clear=''
  if [[ -r "$file" ]]; then read -r first delivered clear <"$file" || true; fi
  [[ "$first" =~ ^[0-9]+$ && "$delivered" =~ ^[0-9]+$ && "$clear" =~ ^[0-9]+$ ]]
}

# write_record KEY FIRST DELIVERED CLEAR. A record that cannot be written ends the check (2): it
# would report again and again, or never.
write_record() {
  [[ "$DRY_RUN" == true ]] && return 0
  printf '%s %s %s\n' "$2" "$3" "$4" >"$STATE_DIR/$1" || fatal "cannot write $STATE_DIR/$1"
}

# What this run has to report: the keys of the problems whose email is due.
due_keys=()

# report: compares the problems with the records and says what is new, what lasts and what is
# over. A report is due for a problem that a second run sees and that no email has carried yet, or
# whose last email is REMIND_SECONDS old or older.
report() {
  local entry key message file current=' ' first delivered clear
  for entry in "${problems[@]}"; do
    key=${entry%%$'\t'*} message=${entry#*$'\t'}
    current+="$key "
    if ! read_record "$key"; then
      log "seen once: $message (reported if another run sees it within the hour)"
      write_record "$key" "$NOW" 0 0
      continue
    fi
    # A time ahead of now (the clock was set back) counts as never.
    if (( delivered > NOW )); then delivered=0; fi
    write_record "$key" "$first" "$delivered" 0
    if (( delivered == 0 )); then
      log "PROBLEM: $message"
      due_keys+=("$key")
    elif (( NOW - delivered >= REMIND_SECONDS )); then
      log "STILL A PROBLEM since $(date -u -d "@$first" +%FT%TZ): $message"
      due_keys+=("$key")
    else
      log "reported at $(date -u -d "@$delivered" +%FT%TZ), again a day after that while it lasts: $message"
    fi
  done
  for file in "$STATE_DIR"/*; do
    [[ -f "$file" ]] || continue
    key=${file##*/}
    [[ "$current" == *" $key "* ]] && continue
    if read_record "$key" && (( clear + 1 < OVER_RUNS )); then
      log "not seen in this run: $key (over after $OVER_RUNS runs in a row without it)"
      write_record "$key" "$first" "$delivered" "$(( clear + 1 ))"
    else
      log "over: $key"
      [[ "$DRY_RUN" == true ]] || rm -f "$file" || fatal "cannot remove $file"
    fi
  done
  if (( ${#fine[@]} > 0 )); then
    log "$( (( ${#problems[@]} > 0 )) && echo 'the rest is fine' || echo ok): $(IFS=,; echo "${fine[*]}" | sed 's/,/, /g')"
  fi
}

# Sourced, as src/lib/deploy-scripts.test.ts does: the functions above only.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

DRY_RUN=false
# systemd makes the folder (RuntimeDirectory= in the unit, kept between runs) and names it.
STATE_DIR=${MONITOR_STATE_DIR:-${RUNTIME_DIRECTORY:-/run/gliagora-monitor}}
NOW=${MONITOR_NOW:-$(date -u +%s)}

case "${1:-}" in
  '') ;;
  --dry-run) DRY_RUN=true ;;
  --delivered)
    # alert.sh, after its email went out: the problems of that run now count as reported (their
    # keys are in .due), or, for a run that ended otherwise than with 1, the check's own failure.
    mkdir -p "$STATE_DIR" || fatal "cannot make $STATE_DIR"
    if [[ "${2:-}" == 1 ]]; then
      if [[ -r "$STATE_DIR/.due" ]]; then
        while IFS= read -r key; do
          [[ "$key" =~ ^[A-Za-z0-9.-]+$ ]] || continue
          if read_record "$key"; then write_record "$key" "$first" "$NOW" "$clear"; fi
        done <"$STATE_DIR/.due"
        rm -f "$STATE_DIR/.due" || fatal "cannot remove $STATE_DIR/.due"
      fi
    else
      printf '%s\n' "$NOW" >"$STATE_DIR/.failed" || fatal "cannot write $STATE_DIR/.failed"
    fi
    exit 0
    ;;
  --failure-reported)
    at=''
    if [[ -r "$STATE_DIR/.failed" ]]; then read -r at <"$STATE_DIR/.failed" || true; fi
    [[ "$at" =~ ^[0-9]+$ ]] && (( at <= NOW && NOW - at < REMIND_SECONDS )) && exit 0
    exit 1
    ;;
  *)
    echo "Usage: check.sh [--dry-run]" >&2
    exit 2
    ;;
esac

# A failure of the check itself (any other way out than the two at the end) ends with 2 and a line.
due=false
trap 'status=$?; [[ $status -eq 0 || "$due" == true ]] || { log "ERROR: the check itself failed (status $status)"; exit 2; }' EXIT

limits_valid || fatal "a limit is no whole number (see the line above)"
[[ "$DRY_RUN" == true ]] || mkdir -p "$STATE_DIR" || fatal "cannot make $STATE_DIR"

check_disk
check_memory
check_certificates
report
# The check ran: an earlier failure of its own is over.
[[ "$DRY_RUN" == true ]] || rm -f "$STATE_DIR/.failed"
if (( ${#due_keys[@]} > 0 )); then
  [[ "$DRY_RUN" == true ]] || printf '%s\n' "${due_keys[@]}" >"$STATE_DIR/.due" \
    || fatal "cannot write $STATE_DIR/.due"
  log "An email about this goes out once, then once a day while it lasts (deploy/README.md, section 15)."
  due=true
  exit 1
fi
[[ "$DRY_RUN" == true ]] || rm -f "$STATE_DIR/.due"
