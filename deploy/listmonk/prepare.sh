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
#      settings can be written;
#   3. applies settings.sql: the list Glia Notes, the app's API user (from LISTMONK_API_TOKEN in
#      .env; only its SHA-256 reaches the database) and the settings, with the app's SMTP_*
#      settings (empty until M2: listmonk can then send nothing);
#   4. restarts listmonk if it is running and anything changed: it reads its settings and API
#      users only when it starts.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
COMPOSE_DIR="${COMPOSE_DIR:-$(dirname "$SCRIPT_DIR")}"
ENV_FILE="${ENV_FILE:-$COMPOSE_DIR/.env}"
ADMIN_PASSWORD_FILE=/root/listmonk-admin-password
ADMIN_USER=gliagora-admin
# listmonk's own address, for the links in its admin: the SSH tunnel's (deploy/README.md).
TUNNEL_URL=http://localhost:9001

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }
compose() { docker compose --project-directory "$COMPOSE_DIR" -f "$COMPOSE_DIR/compose.prod.yml" "$@"; }

# A value from .env, read as Compose reads the file (KEY=value, optionally in single or double
# quotes; the last line wins), never by sourcing it: `EMAIL_FROM=Gliagora <…>` is not shell syntax.
# backup/alert.sh has the same function.
env_value() {
  local line value
  line=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1) || true
  value=${line#*=}
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value=${BASH_REMATCH[1]}; fi
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
  local token_hash host port user pass tls secure default_port
  [[ -n "${LISTMONK_API_TOKEN:-}" ]] || { echo "LISTMONK_API_TOKEN is not set" >&2; return 1; }
  token_hash=$(printf '%s' "$LISTMONK_API_TOKEN" | sha256sum | cut -d' ' -f1)
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
  for key in api_token_sha256 root_url smtp_host smtp_port smtp_user smtp_password smtp_tls; do
    case $key in
      api_token_sha256) value=$token_hash ;;
      root_url) value=${LISTMONK_ROOT_URL:-$TUNNEL_URL} ;;
      smtp_host) value=$host ;;
      smtp_port) value=$port ;;
      smtp_user) value=$user ;;
      smtp_password) value=$pass ;;
      smtp_tls) value=$tls ;;
    esac
    printf 'insert into gliagora_params (key, value) values (%s, %s);\n' "$(sql_text "$key")" "$(sql_text "$value")"
  done
  cat "$SCRIPT_DIR/settings.sql"
  printf 'commit;\n'
}

# Sourced, as src/lib/deploy-scripts.test.ts and CI do: the functions above only.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || return 0

[[ $EUID -eq 0 ]] || fail "Run as root (sudo): the admin password file is root's."
[[ -r "$ENV_FILE" ]] || fail "$ENV_FILE not found."
LISTMONK_API_TOKEN=$(env_value LISTMONK_API_TOKEN)
[[ -n "$LISTMONK_API_TOKEN" ]] \
  || fail "Set LISTMONK_API_TOKEN in $ENV_FILE first (deploy/README.md, \"listmonk\")."
SMTP_HOST=$(env_value SMTP_HOST)
SMTP_PORT=$(env_value SMTP_PORT)
SMTP_SECURE=$(env_value SMTP_SECURE)
SMTP_USER=$(env_value SMTP_USER)
SMTP_PASS=$(env_value SMTP_PASS)
LISTMONK_ROOT_URL=$TUNNEL_URL

log "listmonk 1/4: its database and role"
compose exec -T db bash /docker-entrypoint-initdb.d/20-listmonk-database.sh

log "listmonk 2/4: install (once) and schema"
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
if [[ -n "$changed" || "$fresh" == true ]] && [[ -n "$(compose ps -q --status running listmonk)" ]]; then
  compose restart listmonk
  log "Restarted listmonk, which reads its settings only when it starts."
else
  log "No restart needed."
fi
