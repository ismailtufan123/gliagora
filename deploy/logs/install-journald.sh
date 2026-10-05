#!/usr/bin/env bash
# Installs the journal's time limit (zz-gliagora.conf: 14 days, no copy for syslog; D34) and
# applies it. setup-server.sh runs it on a new server; on the running one, run it once by hand
# (deploy/README.md):
#   sudo /opt/gliagora/logs/install-journald.sh
# Idempotent: it changes nothing when the file is in place and its settings are in force.
#
# journald reads its drop-ins in the order of their file names and the last one wins, so the file
# is installed under a name that sorts last, after Ubuntu's own syslog.conf (ForwardToSyslog=yes),
# and the script then checks what is in force: it fails, loudly, when another file still overrides
# one of our settings (zz-gliagora.conf says why).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE="$SCRIPT_DIR/zz-gliagora.conf"
# The folder can be another one for the tests only (JOURNALD_DROPIN_DIR), which also lifts the
# root check (src/lib/deploy-scripts.test.ts).
DIR="${JOURNALD_DROPIN_DIR:-/etc/systemd/journald.conf.d}"
TARGET="$DIR/zz-gliagora.conf"
# The name this file had first (2026-10-05), which Ubuntu's syslog.conf overrode: removed.
FORMER="$DIR/90-gliagora.conf"

[[ $EUID -eq 0 || -n "${JOURNALD_DROPIN_DIR:-}" ]] || { echo "ERROR: run as root (sudo)." >&2; exit 1; }
[[ -r "$SOURCE" ]] || { echo "ERROR: $SOURCE not found." >&2; exit 1; }

# The value of a setting that is in force: the last one among every file journald reads.
in_force() {
  systemd-analyze cat-config systemd/journald.conf 2>/dev/null \
    | sed -n "s/^$1=//p" | tail -n 1
}

# Every setting of our file is the one in force.
settings_in_force() {
  local line key ok=0
  while IFS= read -r line; do
    [[ "$line" =~ ^([A-Za-z]+)=(.*)$ ]] || continue
    key=${BASH_REMATCH[1]}
    if [[ "$(in_force "$key")" != "${BASH_REMATCH[2]}" ]]; then
      echo "ERROR: $key=${BASH_REMATCH[2]} is not in force: another file under $DIR or" \
        "/usr/lib/systemd/journald.conf.d sets it after $TARGET." >&2
      ok=1
    fi
  done <"$SOURCE"
  return $ok
}

if cmp -s "$SOURCE" "$TARGET" && [[ ! -e "$FORMER" ]]; then
  settings_in_force
  echo "The journal's settings are already in place ($TARGET)."
  exit 0
fi
install -d -m 755 "$DIR"
install -m 644 "$SOURCE" "$TARGET"
rm -f "$FORMER"
systemctl restart systemd-journald
# Apply the limit to what the journal already holds, not only from its next new file on.
journalctl --rotate >/dev/null
journalctl --vacuum-time=14d >/dev/null
settings_in_force
echo "Installed $TARGET: the journal keeps 14 days, without a copy in /var/log/syslog."
