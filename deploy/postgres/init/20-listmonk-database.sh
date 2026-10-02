#!/usr/bin/env bash
# listmonk's own login role and database (M2, D50; PLAN §18.2: one database user per app). The role
# is named like its database, as backup/restore.sh expects (it restores a database owned by the
# role of the same name).
#
# Runs by itself when PostgreSQL starts with an empty data volume (a new server), like
# 10-app-database.sh, and on every update through listmonk/prepare.sh, which runs it in the running
# database container (`docker compose exec -T db bash /docker-entrypoint-initdb.d/20-…`), since an
# existing volume never runs these scripts again. Idempotent: it creates what is missing and sets
# the role's password from LISTMONK_DB_PASSWORD (the db service's environment, from .env) on every
# run, so .env stays the one place that holds it. The password is read with psql's \getenv, so it
# appears in no command line.
set -euo pipefail

: "${LISTMONK_DB_PASSWORD:?LISTMONK_DB_PASSWORD is not set}"

psql -v ON_ERROR_STOP=1 -X -q --username "${POSTGRES_USER:-postgres}" --dbname postgres <<'SQL'
-- PostgreSQL logs a statement that fails, which here could hold the password: not in this session.
SET log_min_error_statement = panic;
\getenv listmonk_password LISTMONK_DB_PASSWORD
SELECT 'CREATE ROLE listmonk'
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'listmonk')\gexec
ALTER ROLE listmonk WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'listmonk_password';
SELECT 'CREATE DATABASE listmonk OWNER listmonk'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'listmonk')\gexec
REVOKE ALL ON DATABASE listmonk FROM PUBLIC;
SQL
