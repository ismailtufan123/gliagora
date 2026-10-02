#!/usr/bin/env bash
# Runs once, when PostgreSQL starts with an empty data volume. Creates the app's own login role and
# database, so the app never uses the PostgreSQL superuser (one database user per app, PLAN §18.2).
# listmonk has its own (20-listmonk-database.sh, M2); Umami will get one the same way.
set -euo pipefail

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is not set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE gliagora LOGIN PASSWORD :'app_password';
CREATE DATABASE gliagora OWNER gliagora;
REVOKE ALL ON DATABASE gliagora FROM PUBLIC;
SQL
