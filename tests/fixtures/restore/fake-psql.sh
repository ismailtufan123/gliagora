# A stand-in for psql, for src/lib/restore-carry.test.ts (sourced after deploy/backup/restore.sh).
# It answers which tables exist (TABLES, separated by spaces), writes binary copies (with one row
# when ROWS is set), gives every sequence the value 7 and fails where FAIL says: `regclass` (the
# question whether a table exists), `copy` (a copy out) or `garbage` (a copy out that writes no
# COPY file). With ENUMS, the deletion log's `action` is an enum column, whose labels the carried
# rows all have (`present`) or not (`missing`); without it, no table has one. Every call is added to
# the file CALLS.
fake_psql() {
  local query='' table
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -tAc | -c)
        query=$2
        shift 2
        ;;
      *) shift ;;
    esac
  done
  case "$query" in
    *to_regclass*)
      echo "regclass $query" >>"$CALLS"
      [[ "${FAIL:-}" != regclass ]] || return 1
      table=${query#*public.}
      table=${table%%\'*}
      if [[ " $TABLES " == *" $table "* ]]; then echo t; else echo f; fi
      ;;
    "copy (select"*)
      echo "copy out" >>"$CALLS"
      if [[ "${FAIL:-}" == copy ]]; then
        echo 'ERROR: column "name" does not exist' >&2
        return 1
      fi
      if [[ "${FAIL:-}" == garbage ]]; then
        echo 'not a copy'
        return 0
      fi
      # The 19-byte header (signature, flags, no extension), a row if asked, the trailer.
      printf 'PGCOPY\n\377\r\n\0\0\0\0\0\0\0\0\0'
      [[ -z "${ROWS:-}" ]] || printf '\0\1\0\0\0\1x'
      printf '\377\377'
      ;;
    *pg_sequences*) echo 7 ;;
    *pg_attribute*)
      echo "enums $query" >>"$CALLS"
      if [[ -n "${ENUMS:-}" && "$query" == *"'public.deletion_log'"* ]]; then
        echo 'action enum_deletion_log_action'
      fi
      ;;
    *pg_enum*)
      echo "labels $query" >>"$CALLS"
      if [[ "${ENUMS:-}" == missing ]]; then echo 1; else echo 0; fi
      ;;
    "copy restore_carry"*)
      cat >/dev/null
      echo "copy in" >>"$CALLS"
      ;;
    '')
      echo "transaction" >>"$CALLS"
      cat >>"$CALLS"
      ;;
    *) echo "statement $query" >>"$CALLS" ;;
  esac
}
