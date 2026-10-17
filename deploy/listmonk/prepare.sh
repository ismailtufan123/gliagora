#!/usr/bin/env bash
# Prepares listmonk, the Glia Notes newsletter service (M2, D50; deploy/README.md, "listmonk").
# update.sh runs it after the backup and before it starts the stack, so on every update and
# deploy; it is idempotent and quick, and prints no secret. By hand: sudo ./listmonk/prepare.sh
#
#   1. listmonk's role and database (postgres/init/20-listmonk-database.sh, run in the database
#      container: an existing data volume never runs the init scripts again), with
#      LISTMONK_DB_PASSWORD from .env;
#   2. installs listmonk once, with the admin user gliagora-admin. Its password is generated into
#      /root/listmonk-admin-password (only root can read it, like /root/site-password, D42) and
#      reaches the one-off install on stdin only, never in a command line or a container's
#      settings; listmonk itself never creates an admin for "the first visitor". Then it brings
#      listmonk's schema up to date (--upgrade), which a new listmonk image needs before its
#      settings can be written. When the running listmonk is not on the image compose.prod.yml
#      names (an upgrade), it is stopped first: the old program must not keep working on a
#      database the new one migrates;
#   3. applies settings.sql: the list Glia Notes, the app's API user (from LISTMONK_API_TOKEN in
#      .env; only its SHA-256 reaches the database), the issues' API user (LISTMONK_CAMPAIGNS_TOKEN,
#      M11; disabled while it is empty) and the settings, with the app's SMTP_* settings (empty
#      until M2: listmonk can then send nothing) and the issues' sending rate from MAILBOX_LIMIT_*
#      and EMAIL_CAP_*;
#   4. if listmonk was running and anything changed (or it was just installed, or stopped for a
#      new image), starts it again, recreated on the image compose.prod.yml names: it reads its
#      settings and API users only when it starts (a plain restart would keep the old image).
#      While it is sending an issue of Glia Notes (a campaign running or paused, M11), a restart
#      for changed settings waits for the next update (a file notes it): listmonk keeps the count
#      of its sending window in memory, so a restart would start a fresh window and could send
#      more in a day than the mailbox's share. A new image or a new install starts it all the same.
# src/lib/deploy-scripts.test.ts runs it against a stand-in for docker, with a password file of
# its own (LISTMONK_ADMIN_PASSWORD_FILE, for the tests only).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_DIR="${COMPOSE_DIR:-$(dirname "$SCRIPT_DIR")}"
ENV_FILE="${ENV_FILE:-$COMPOSE_DIR/.env}"
ADMIN_PASSWORD_FILE="${LISTMONK_ADMIN_PASSWORD_FILE:-/root/listmonk-admin-password}"
ADMIN_USER=gliagora-admin
# A restart that waited while listmonk was sending (step 4).
RESTART_PENDING="$COMPOSE_DIR/.listmonk-restart-pending"
# listmonk's own address, for the links in its admin: the SSH tunnel's (deploy/README.md).
TUNNEL_URL=http://localhost:9001

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
compose() { docker compose --project-directory "$COMPOSE_DIR" -f "$COMPOSE_DIR/compose.prod.yml" "$@"; }

# A value from .env, never by sourcing it (`EMAIL_FROM=Gliagora <…>` is not shell syntax), and
# only where Docker Compose, which gives the app the same file, reads it the same way: KEY=value,
# nothing around the `=`, and the value either in single quotes (taken as written, by both) or,
# unquoted or in double quotes, without $ \ " # (which Compose expands or cuts) and without spaces
# at its ends. The last line wins. Any other line for the key is refused with a message that names
# the variable, never its value: write that value in single quotes (deploy/.env.example).
# The same function is in listmonk/prepare.sh and backup/alert.sh (a test checks that they agree).
env_value() {
  local key=$1 line value=''
  local single="^'([^']*)'\$" double='^"([^"$\#]*)"$'
  local plain='^([^[:space:]"$\#'\'']([^"$\#]*[^[:space:]"$\#])?)?$'
  while IFS= read -r line; do
    if [[ "$line" == "$key="* ]]; then
      value=${line#"$key="}
      if [[ "$value" =~ $single && "${BASH_REMATCH[1]}" != *\\ ]] \
        || [[ "$value" =~ $double || "$value" =~ $plain ]]; then
        value=${BASH_REMATCH[1]}
        continue
      fi
    fi
    echo "$key in $ENV_FILE is written in a way Docker Compose reads differently: put its value in single quotes ($key='…'), on a line of its own." >&2
    return 1
  done < <(grep -E "^[[:space:]]*(export[[:space:]]+)?$key[[:space:]]*[=:]" "$ENV_FILE" || true)
  printf '%s' "$value"
}

trim() { local s=$1; s=${s#"${s%%[![:space:]]*}"}; printf '%s' "${s%"${s##*[![:space:]]}"}"; }

# A text as an SQL string literal (standard strings: only ' is doubled).
sql_text() { printf "'%s'" "${1//\'/\'\'}"; }

# The input for psql: the parameters of settings.sql as rows of its temporary table, then the file,
# all in one transaction. Reads LISTMONK_API_TOKEN, LISTMONK_ROOT_URL and the SMTP_* settings as
# the app reads them (src/lib/email/settings.ts; src/scripts/listmonk-settings.ts does the same for
# `pnpm listmonk:setup`): TLS from the start with SMTP_SECURE=true, otherwise STARTTLS, required
# except on this computer (Mailpit). Every value is written by printf, a bash builtin, so none
# appears in a command line; the session never logs a failed statement.
settings_input() {
  local token token_hash campaigns campaigns_hash host port user pass tls secure default_port
  token=$(trim "${LISTMONK_API_TOKEN:-}")
  [[ -n "$token" ]] || { echo "LISTMONK_API_TOKEN is not set" >&2; return 1; }
  token_hash=$(printf '%s' "$token" | sha256sum | cut -d' ' -f1)
  campaigns=$(trim "${LISTMONK_CAMPAIGNS_TOKEN:-}")
  campaigns_hash=''
  [[ -z "$campaigns" ]] || campaigns_hash=$(printf '%s' "$campaigns" | sha256sum | cut -d' ' -f1)
  host=$(trim "${SMTP_HOST:-}")
  secure=false
  [[ "$(trim "${SMTP_SECURE:-}" | tr '[:upper:]' '[:lower:]')" == true ]] && secure=true
  port='' user='' pass='' tls=''
  if [[ -n "$host" ]]; then
    default_port=587
    [[ "$secure" == true ]] && default_port=465
    port=$(trim "${SMTP_PORT:-}")
    if [[ -z "$port" ]]; then
      port=$default_port
    elif ! [[ "$port" =~ ^[0-9]{1,5}$ ]] || ((10#$port < 1 || 10#$port > 65535)); then
      echo "SMTP_PORT is not a port number; using $default_port." >&2
      port=$default_port
    fi
    port=$((10#$port))
    user=$(trim "${SMTP_USER:-}")
    [[ -z "$user" ]] || pass=${SMTP_PASS:-}
    if [[ "$secure" == true ]]; then
      tls=TLS
    elif [[ "$(tr '[:upper:]' '[:lower:]' <<<"$host")" =~ ^(localhost|127\.0\.0\.1|::1|\[::1\])$ ]]; then
      tls=none
    else
      tls=STARTTLS
    fi
  fi
  printf 'set log_min_error_statement = panic;\nbegin;\n'
  printf 'create temp table gliagora_params (key text primary key, value text not null) on commit drop;\n'
  local key value
  for key in api_token_sha256 root_url smtp_host smtp_port smtp_user smtp_password smtp_tls \
    campaigns_token_sha256 mailbox_limit_hour mailbox_limit_day email_cap_hour email_cap_day; do
    case $key in
      api_token_sha256) value=$token_hash ;;
      root_url) value=${LISTMONK_ROOT_URL:-$TUNNEL_URL} ;;
      smtp_host) value=$host ;;
      smtp_port) value=$port ;;
      smtp_user) value=$user ;;
      smtp_password) value=$pass ;;
      smtp_tls) value=$tls ;;
      campaigns_token_sha256) value=$campaigns_hash ;;
      mailbox_limit_hour) value=$(trim "${MAILBOX_LIMIT_HOUR:-}") ;;
      mailbox_limit_day) value=$(trim "${MAILBOX_LIMIT_DAY:-}") ;;
      email_cap_hour) value=$(trim "${EMAIL_CAP_HOUR:-}") ;;
      email_cap_day) value=$(trim "${EMAIL_CAP_DAY:-}") ;;
    esac
    printf 'insert into gliagora_params (key, value) values (%s, %s);\n' "$(sql_text "$key")" "$(sql_text "$value")"
  done
  cat "$SCRIPT_DIR/settings.sql"
  printf 'commit;\n'
}

# Sourced, as src/lib/deploy-scripts.test.ts and CI do: the functions above only.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

[[ $EUID -eq 0 || -n "${LISTMONK_ADMIN_PASSWORD_FILE:-}" ]] \
  || fail "Run as root (sudo): the admin password file is root's."
[[ -r "$ENV_FILE" ]] || fail "$ENV_FILE not found."
# Each value into the variable of its name (never shown); a line Compose would read differently
# stops here, before anything changes, so listmonk never gets another password than the app.
for name in LISTMONK_API_TOKEN SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS \
  LISTMONK_CAMPAIGNS_TOKEN MAILBOX_LIMIT_HOUR MAILBOX_LIMIT_DAY EMAIL_CAP_HOUR EMAIL_CAP_DAY; do
  value=$(env_value "$name") || fail "Nothing was changed: correct $name in $ENV_FILE (see above)."
  printf -v "$name" '%s' "$value"
done
unset value
[[ -n "$LISTMONK_API_TOKEN" ]] \
  || fail "Set LISTMONK_API_TOKEN in $ENV_FILE first (deploy/README.md, \"listmonk\")."
LISTMONK_ROOT_URL=$TUNNEL_URL

log "listmonk 1/4: its database and role"
compose exec -T db bash /docker-entrypoint-initdb.d/20-listmonk-database.sh

log "listmonk 2/4: install (once) and schema"
# A listmonk that runs another image than compose.prod.yml names (an upgrade) is stopped while the
# new image migrates its database, as upstream's upgrade says; step 4 starts the new one.
running=$(compose ps -q --status running listmonk)
new_image=false
if [[ -n "$running" ]]; then
  images=$(compose config --images)
  wanted=$(awk '/^listmonk\/listmonk[:@]/ { print; exit }' <<<"$images")
  if [[ "$(docker inspect -f '{{.Config.Image}}' "$running")" != "$wanted" ]]; then
    log "listmonk runs another image than compose.prod.yml names: stopping it for the upgrade"
    compose stop listmonk
    new_image=true
  fi
fi
installed=$(compose exec -T db psql -U postgres -d listmonk -X -tAc \
  "select to_regclass('public.settings') is not null")
fresh=false
if [[ "$installed" != t ]]; then
  if [[ ! -s "$ADMIN_PASSWORD_FILE" ]]; then
    (umask 077 && openssl rand -hex 20 >"$ADMIN_PASSWORD_FILE")
    log "Generated the admin password of listmonk into $ADMIN_PASSWORD_FILE (only root can read it)."
  fi
  # The password on stdin, read by the shell in the container: never in a command line or in the
  # container's settings. No API user is asked for, so listmonk prints no token.
  # shellcheck disable=SC2016
  compose run --rm -T --no-deps listmonk sh -c 'IFS= read -r LISTMONK_ADMIN_PASSWORD &&
    export LISTMONK_ADMIN_PASSWORD LISTMONK_ADMIN_USER='"$ADMIN_USER"' &&
    exec ./listmonk --install --idempotent --yes --config ""' <"$ADMIN_PASSWORD_FILE"
  fresh=true
  log "Installed listmonk, with the admin user $ADMIN_USER."
fi
compose run --rm -T --no-deps listmonk ./listmonk --upgrade --yes --config ''

log "listmonk 3/4: settings (settings.sql)"
changed=$(settings_input | compose exec -T db psql -U postgres -d listmonk -X -q -tA -v ON_ERROR_STOP=1) \
  || fail "listmonk's settings were not applied (nothing was changed); see the message above."
changed=$(trim "$changed")
if [[ -n "$changed" ]]; then log "Changed: $changed"; else log "Nothing to change."; fi

log "listmonk 4/4: restart if needed"
if [[ -n "$running" ]] && [[ -n "$changed" || "$fresh" == true || "$new_image" == true || -e "$RESTART_PENDING" ]]; then
  sending=0
  if [[ "$fresh" != true && "$new_image" != true ]]; then
    sending=$(compose exec -T db psql -U postgres -d listmonk -X -tAc \
      "select count(*) from campaigns where status in ('running', 'paused')")
    sending=$(trim "${sending:-0}")
  fi
  if [[ "$sending" =~ ^[1-9] ]]; then
    : >"$RESTART_PENDING"
    log "listmonk is sending an issue: its restart waits for the next update ($RESTART_PENDING)."
  else
    # Recreated, so it runs the image compose.prod.yml names (`restart` would keep the old one).
    compose up -d --no-deps --force-recreate listmonk
    rm -f "$RESTART_PENDING"
    log "Started listmonk again (it reads its settings only when it starts)."
  fi
else
  log "No restart needed."
fi
