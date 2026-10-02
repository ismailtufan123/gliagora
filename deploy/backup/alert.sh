#!/usr/bin/env bash
# Emails the result of a backup or restore test (D42; M2, D50). Run by systemd after the unit's
# run, whatever its result (ExecStopPost=-/opt/gliagora/backup/alert.sh %N in
# gliagora-backup.service and gliagora-restore-test.service), with SERVICE_RESULT ("success" or
# what failed), EXIT_CODE and EXIT_STATUS set by systemd. It emails:
#   - every failure;
#   - a success only of the monthly restore test and of the Sunday backup (the one that checks the
#     repository), so the operator hears from the backups at least once a week: a week without an
#     email means that something is wrong (a timer that stopped, a mail server that refuses).
#
# The settings: ALERT_EMAIL, the recipient, in backup.env (only on the server; never a real address
# in the repository), and the app's SMTP_* settings and EMAIL_FROM, read from /opt/gliagora/.env
# (never sourced: `EMAIL_FROM=Gliagora <…>` is not shell syntax). Without SMTP_HOST or ALERT_EMAIL
# it says "alerts off" in the journal and sends nothing. Sent with curl: on port 587 STARTTLS is
# required, with SMTP_SECURE=true TLS from the start (smtps://), without TLS only to this computer
# (127.0.0.1, localhost). The SMTP password reaches curl through a file descriptor, never in a
# command line; never add -v (it shows the login) or `set -x`.
#
# The email holds the unit, its result and this run's own lines from backup.sh or restore.sh
# (theirs only, the ones that start with a time: database names, snapshot IDs, counts), with any
# email address replaced: never what a database holds.
#
# To try it by hand (sends a "failed" email for the last run): sudo SERVICE_RESULT=exit-code
# /opt/gliagora/backup/alert.sh gliagora-backup
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

log() { echo "[$(date -u +%FT%TZ)] alert: $*"; }

# A value from .env, read as Compose reads the file (KEY=value, optionally in single or double
# quotes; the last line wins). listmonk/prepare.sh has the same function.
env_value() {
  local line value
  line=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1) || true
  value=${line#*=}
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value=${BASH_REMATCH[1]}; fi
  printf '%s' "$value"
}

trim() { local s=$1; s=${s#"${s%%[![:space:]]*}"}; printf '%s' "${s%"${s##*[![:space:]]}"}"; }

# What the unit is, in the subject.
unit_label() {
  case $1 in
    gliagora-backup) echo backup ;;
    gliagora-restore-test) echo 'restore test' ;;
    *) echo "$1" ;;
  esac
}

# Whether this run is worth an email: should_alert UNIT RESULT WEEKDAY (1-7, 7 = Sunday, UTC).
should_alert() {
  [[ "$2" != success ]] && return 0
  [[ "$1" == gliagora-restore-test ]] && return 0
  [[ "$1" == gliagora-backup && "$3" == 7 ]] && return 0
  return 1
}

# The bare address of "Name <address>" or of an address.
bare_address() {
  local value
  value=$(trim "$1")
  if [[ "$value" =~ \<([^\<\>]+)\>$ ]]; then value=${BASH_REMATCH[1]}; fi
  printf '%s' "$(trim "$value")"
}

# A value for curl's config file, in double quotes (\ and " escaped).
curl_quoted() { local s=${1//\\/\\\\}; printf '"%s"' "${s//\"/\\\"}"; }

# This run's own log lines (backup.sh and restore.sh start theirs with a time in brackets), with
# any email address replaced. They come from the journal, by the run's invocation ID.
run_lines() {
  [[ -n "${INVOCATION_ID:-}" ]] || { echo '(No run: sent by hand.)'; return 0; }
  journalctl --no-pager -o cat "_SYSTEMD_INVOCATION_ID=$INVOCATION_ID" 2>/dev/null \
    | grep -E '^\[[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z\] ' | grep -v '\] alert: ' \
    | sed -E 's/[^[:space:]<>"]+@[^[:space:]<>"]+/[address]/g' | tail -n 40 || true
}

# Sends the message on stdin with curl: send_mail URL FROM TO TLS(required|none) [USER]; the
# password, if any, in SMTP_PASS. Reads nothing else.
send_mail() {
  local url=$1 from=$2 to=$3 tls=$4 user=${5:-} options=(--silent --show-error --max-time 60 --crlf)
  [[ "$tls" == required ]] && options+=(--ssl-reqd)
  if [[ -n "$user" ]]; then
    curl "${options[@]}" --url "$url" --mail-from "$from" --mail-rcpt "$to" --upload-file - \
      -K <(printf 'user = %s\n' "$(curl_quoted "$user:${SMTP_PASS:-}")")
  else
    curl "${options[@]}" --url "$url" --mail-from "$from" --mail-rcpt "$to" --upload-file -
  fi
}

# Sourced, as src/lib/deploy-scripts.test.ts does: the functions above only.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

unit="${1:?Usage: alert.sh UNIT (the unit name without .service: %N in the unit)}"
result="${SERVICE_RESULT:-unknown}"
CONFIG="${BACKUP_CONFIG:-$SCRIPT_DIR/backup.env}"
[[ -r "$CONFIG" ]] || { log "alerts off: $CONFIG not found"; exit 0; }
set -a
# shellcheck source=/dev/null
. "$CONFIG"
set +a
ENV_FILE="${ALERT_ENV_FILE:-${COMPOSE_DIR:-/opt/gliagora}/.env}"
to=$(trim "${ALERT_EMAIL:-}")
host=''
[[ -r "$ENV_FILE" ]] && host=$(trim "$(env_value SMTP_HOST)")
if [[ -z "$host" || -z "$to" ]]; then
  missing=$([[ -z "$host" ]] && echo "SMTP_HOST in $ENV_FILE" || echo "ALERT_EMAIL in $CONFIG")
  log "alerts off (no $missing); the $(unit_label "$unit") ended: $result"
  exit 0
fi
[[ "$to" =~ ^[^[:space:]@\<\>]+@[^[:space:]@\<\>]+\.[^[:space:]@\<\>]+$ ]] \
  || { log "ALERT_EMAIL in $CONFIG is not an email address; nothing sent"; exit 1; }
if ! should_alert "$unit" "$result" "$(date -u +%u)"; then
  log "no email for this success (only the Sunday backup and the restore test send one)"
  exit 0
fi

secure=false
[[ "$(trim "$(env_value SMTP_SECURE)" | tr '[:upper:]' '[:lower:]')" == true ]] && secure=true
port=$(trim "$(env_value SMTP_PORT)")
[[ "$port" =~ ^[0-9]{1,5}$ ]] || port=$([[ "$secure" == true ]] && echo 465 || echo 587)
user=$(trim "$(env_value SMTP_USER)")
SMTP_PASS=$(env_value SMTP_PASS)
from_header=$(trim "$(env_value EMAIL_FROM)")
[[ -n "$from_header" ]] || from_header='Gliagora <hello@gliagora.com>'
from=$(bare_address "$from_header")
if [[ "$secure" == true ]]; then
  url="smtps://$host:$port" tls=required
elif [[ "$(tr '[:upper:]' '[:lower:]' <<<"$host")" =~ ^(localhost|127\.0\.0\.1)$ ]]; then
  url="smtp://$host:$port" tls=none
else
  url="smtp://$host:$port" tls=required
fi

label=$(unit_label "$unit")
if [[ "$result" == success ]]; then
  outcome=$([[ "$unit" == gliagora-restore-test ]] && echo passed || echo finished)
else
  outcome=failed
fi
subject="[gliagora] $label $outcome"
message=$(
  printf 'From: %s\nTo: %s\nSubject: %s\nDate: %s\nMessage-ID: <%s.%s@%s>\n' \
    "$from_header" "$to" "$subject" "$(date -R)" "$(date -u +%Y%m%d%H%M%S)" "$RANDOM$RANDOM" "${from#*@}"
  printf 'MIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n'
  printf 'Auto-Submitted: auto-generated\n\n'
  printf 'Unit: %s.service on %s\nResult: %s (%s %s)\nTime: %s\n\n' "$unit" "$(hostname)" "$outcome" \
    "$result" "${EXIT_STATUS:-}" "$(date -u +%FT%TZ)"
  printf "This run's lines:\n\n"
  run_lines
  printf '\nThe whole log, on the server: journalctl -u %s\n' "$unit"
)
if send_mail "$url" "$from" "$to" "$tls" "$user" <<<"$message"; then
  log "sent \"$subject\" to ALERT_EMAIL"
else
  log "could not send \"$subject\" (curl failed; see the line above)"
  exit 1
fi
