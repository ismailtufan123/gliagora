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
# No alert repeats every few minutes. A problem is reported once two runs in a row see it (a
# moment of low memory during a backup, or Caddy restarting, is not one), then again once a day
# while it lasts. It keeps what it has seen in its state folder, one file per problem; when a
# problem is over, the file goes and the journal says so (no email). A run without a report ends
# well, also while a problem that was reported is still there.
#
# Exit: 0 nothing to report now; 1 a report is due (the email); 2 the check itself failed (a
# line says where). It reads SITE_DOMAIN from /opt/gliagora/.env with alert.sh's own reader and prints no
# other setting. To see what it would say, without changing its state:
#   sudo /opt/gliagora/monitor/check.sh --dry-run
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
  check_certificate "$domain"
  check_certificate "www.$domain"
}

# report: compares the problems with the state folder and says what is new, what lasts and what
# is over. Returns 1 when a report is due: a problem seen in two runs in a row and not reported
# yet, or reported REMIND_SECONDS ago or longer.
report() {
  local entry key message file first alerted due=0 current=' ' since
  for entry in "${problems[@]}"; do
    key=${entry%%$'\t'*} message=${entry#*$'\t'}
    current+="$key "
    file="$STATE_DIR/$key"
    first='' alerted=''
    [[ -r "$file" ]] && read -r first alerted <"$file" || true
    if [[ ! "$first" =~ ^[0-9]+$ || ! "$alerted" =~ ^[0-9]+$ ]]; then
      log "seen once: $message (reported if the next run sees it too)"
      remember "$file" "$NOW 0"
    elif (( alerted == 0 )); then
      log "PROBLEM: $message"
      remember "$file" "$first $NOW"
      due=1
    elif (( NOW - alerted >= REMIND_SECONDS )); then
      since=$(date -u -d "@$first" +%FT%TZ)
      log "STILL A PROBLEM since $since: $message"
      remember "$file" "$first $NOW"
      due=1
    else
      log "reported at $(date -u -d "@$alerted" +%FT%TZ), again a day after that while it lasts: $message"
    fi
  done
  for file in "$STATE_DIR"/*; do
    [[ -f "$file" ]] || continue
    key=${file##*/}
    [[ "$current" == *" $key "* ]] && continue
    log "over: $key"
    [[ "$DRY_RUN" == true ]] || rm -f "$file"
  done
  if (( ${#fine[@]} > 0 )); then
    log "$( (( ${#problems[@]} > 0 )) && echo 'the rest is fine' || echo ok): $(IFS=,; echo "${fine[*]}" | sed 's/,/, /g')"
  fi
  if (( due )); then
    log "This is reported once now and once a day while it lasts (deploy/README.md, \"Monitoring emails\")."
    return 1
  fi
}

remember() { [[ "$DRY_RUN" == true ]] || printf '%s\n' "$2" >"$1"; }

# Sourced, as src/lib/deploy-scripts.test.ts does: the functions above only.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

# A failure of the check itself (any other way out than the two at the end) ends with 2 and a line.
due=false
trap 'status=$?; [[ $status -eq 0 || "$due" == true ]] || { log "ERROR: the check itself failed (status $status)"; exit 2; }' EXIT

DRY_RUN=false
[[ "${1:-}" == --dry-run ]] && DRY_RUN=true
# systemd makes the folder (StateDirectory= in the unit) and names it in STATE_DIRECTORY.
STATE_DIR=${MONITOR_STATE_DIR:-${STATE_DIRECTORY:-/var/lib/gliagora-monitor}}
[[ "$DRY_RUN" == true ]] || mkdir -p "$STATE_DIR"
NOW=${MONITOR_NOW:-$(date -u +%s)}

check_disk
check_memory
check_certificates
if ! report; then
  due=true
  exit 1
fi
