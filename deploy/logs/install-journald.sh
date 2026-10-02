#!/usr/bin/env bash
# Installs the journal's time limit (90-gliagora.conf: 14 days, no copy for syslog; D34) and
# applies it. setup-server.sh runs it on a new server; on the running one, run it once by hand
# (deploy/README.md):
#   sudo /opt/gliagora/logs/install-journald.sh
# Idempotent: it changes nothing when the file is already in place.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE="$SCRIPT_DIR/90-gliagora.conf"
TARGET=/etc/systemd/journald.conf.d/90-gliagora.conf

[[ $EUID -eq 0 ]] || { echo "ERROR: run as root (sudo)." >&2; exit 1; }
[[ -r "$SOURCE" ]] || { echo "ERROR: $SOURCE not found." >&2; exit 1; }

if cmp -s "$SOURCE" "$TARGET"; then
  echo "The journal's settings are already in place ($TARGET)."
  exit 0
fi
install -d -m 755 "$(dirname "$TARGET")"
install -m 644 "$SOURCE" "$TARGET"
systemctl restart systemd-journald
# Apply the limit to what the journal already holds, not only from its next new file on.
journalctl --rotate >/dev/null
journalctl --vacuum-time=14d >/dev/null
echo "Installed $TARGET: the journal keeps 14 days, without a copy in /var/log/syslog."
