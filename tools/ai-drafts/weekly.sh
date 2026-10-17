#!/usr/bin/env bash
# The weekly AI drafts (M7, D52; docs/weekly-drafts.md), run on the operator's computer from the
# repository's folder. The operator's standing go-ahead covers exactly these two server steps: the
# export and the import, through the app's operations routes (src/lib/ops/auth.ts).
#
#   tools/ai-drafts/weekly.sh export          the waiting candidates, redacted, into ai-drafts/<day>/export.json
#   tools/ai-drafts/weekly.sh check  FILE     the drafts checked on the server, nothing stored (a dry run)
#   tools/ai-drafts/weekly.sh import FILE     the drafts stored in the candidates' "AI draft"
#   tools/ai-drafts/weekly.sh clean           the local files of every run deleted
#
# ai-drafts/ is ignored by git. The export holds the postings' text with names, email addresses and
# phone numbers replaced, and no addresses of postings; delete it after the run (clean).
set -euo pipefail

HOST=${GLIAGORA_HOST:-gliagora@45.144.214.78}
# One SSH connection for the run (the server's firewall limits new ones).
SSH=(ssh -o ControlMaster=auto -o "ControlPath=$HOME/.ssh/cm-%C" -o ControlPersist=600 "$HOST")
CALL='cd /opt/gliagora && docker compose -f compose.prod.yml exec -T app node ops/call.mjs'

cd "$(dirname "$0")/../.."
case "${1:-}" in
  export)
    dir="ai-drafts/$(date -u +%F)"
    mkdir -p "$dir"
    chmod 700 ai-drafts "$dir"
    "${SSH[@]}" "$CALL GET /api/ops/ai-drafts/export/" > "$dir/export.json"
    node -e 'const e = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(`${e.candidates.length} candidates in ${process.argv[1]}${e.leftForEditors ? ` (${e.leftForEditors} left for an editor: text in a script redaction cannot read)` : ""}`)' "$dir/export.json"
    ;;
  check | import)
    file=${2:?Name the drafts file.}
    node -e 'const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (d.format !== "gliagora-ai-drafts/1" || !Array.isArray(d.drafts)) { console.error("Not a drafts file (format gliagora-ai-drafts/1)."); process.exit(1) } console.log(`${d.drafts.length} drafts`)' "$file"
    query=$([ "$1" = check ] && echo '?dry=1' || true)
    "${SSH[@]}" "$CALL POST '/api/ops/ai-drafts/import/$query'" < "$file"
    ;;
  clean)
    rm -rf ai-drafts
    echo "Deleted ai-drafts/."
    ;;
  *)
    sed -n '2,13p' "$0"
    exit 2
    ;;
esac
