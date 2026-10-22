#!/usr/bin/env bash
# "Update the jobs" (D59; docs/update-jobs.md), run on the operator's computer from the repository's
# folder. The operator's standing go-ahead covers exactly these server steps, through the app's
# operations routes (src/lib/ops/auth.ts): the export and import of the drafts (tools/ai-drafts/
# weekly.sh), and the routine's export, decisions (with the last look and publishing), closing and
# corrections. Nothing is published without the operator's command.
#
#   tools/update-jobs/update.sh export                 the drafted waiting candidates into update-jobs/<day>/export.json
#   tools/update-jobs/update.sh institutions NAME…     our institutions (ROR) by name
#   tools/update-jobs/update.sh check FILE             the decisions checked on the server, nothing read or saved
#   tools/update-jobs/update.sh decide FILE            the decisions applied (last look, publish, reject, ask), in batches
#   tools/update-jobs/update.sh close [--dry]          jobs whose page the link check found gone or filled, withdrawn
#   tools/update-jobs/update.sh change FILE [--dry]    the operator's corrections of published jobs
#   tools/update-jobs/update.sh report                 the run's report into update-jobs/<day>/report.json
#   tools/update-jobs/update.sh clean                  the local files of every run deleted
#
# update-jobs/ is ignored by git. The export holds the postings' text with names, email addresses,
# phone numbers and web addresses replaced, and no addresses of postings; delete it after the run.
set -euo pipefail

HOST=${GLIAGORA_HOST:-gliagora@45.144.214.78}
# One SSH connection for the run (the server's firewall limits new ones).
SSH=(ssh -o ControlMaster=auto -o "ControlPath=$HOME/.ssh/cm-%C" -o ControlPersist=600 "$HOST")
CALL='cd /opt/gliagora && docker compose -f compose.prod.yml exec -T app node ops/call.mjs'
# Decisions per call: each publication reads one page, a few seconds apart on one host.
BATCH=${UPDATE_JOBS_BATCH:-25}

cd "$(dirname "$0")/../.."
dir="update-jobs/$(date -u +%F)"
here() { mkdir -p "$dir"; chmod 700 update-jobs "$dir"; }

case "${1:-}" in
  export)
    here
    "${SSH[@]}" "$CALL GET /api/ops/jobs/export/" > "$dir/export.json"
    node -e 'const e = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(`${e.candidates.length} drafted candidates to decide in ${process.argv[1]}; ${e.waitingForDrafts} wait for a draft; ${e.leftForEditors} left for an editor (a script redaction cannot read)`)' "$dir/export.json"
    ;;
  institutions)
    shift
    [ "$#" -gt 0 ] || { echo 'Name at least one institution.' >&2; exit 2; }
    node -e 'console.log(JSON.stringify({ names: process.argv.slice(1) }))' "$@" |
      "${SSH[@]}" "$CALL POST /api/ops/jobs/institutions/"
    ;;
  check | decide)
    file=${2:?Name the decisions file.}
    node -e 'const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (d.format !== "gliagora-job-decisions/1" || !Array.isArray(d.decisions)) { console.error("Not a decisions file (format gliagora-job-decisions/1)."); process.exit(1) } console.log(`${d.decisions.length} decisions${d.bySource ? `, ${d.bySource.length} by source` : ""}`)' "$file"
    if [ "$1" = check ]; then
      "${SSH[@]}" "$CALL POST '/api/ops/jobs/decide/?dry=1'" < "$file"
      exit 0
    fi
    here
    # Each run keeps its own batches and answers, so a re-run after a dropped connection loses
    # nothing: decided candidates answer "decided" with their job the second time.
    parts="$dir/run-$(date -u +%H%M%S)"
    mkdir -p "$parts"
    node -e '
      const fs = require("fs")
      const [file, parts, size] = process.argv.slice(1)
      const d = JSON.parse(fs.readFileSync(file, "utf8"))
      if (d.decisions.length === 0 && !d.bySource?.length) { console.error("Nothing to decide."); process.exit(3) }
      const batches = []
      for (let i = 0; i < d.decisions.length; i += Number(size)) batches.push(d.decisions.slice(i, i + Number(size)))
      if (batches.length === 0) batches.push([])
      batches.forEach((decisions, n) => {
        const part = { format: d.format, decisions, ...(n === 0 && d.bySource ? { bySource: d.bySource } : {}) }
        fs.writeFileSync(`${parts}/${String(n).padStart(3, "0")}.json`, JSON.stringify(part))
      })' "$file" "$parts" "$BATCH" || { [ $? -eq 3 ] && exit 0; exit 1; }
    status=0
    for part in "$parts"/[0-9]*.json; do
      case "$part" in *.result.json) continue ;; esac
      if ! "${SSH[@]}" "$CALL POST /api/ops/jobs/decide/" < "$part" > "${part%.json}.result.json"; then
        echo "A batch failed ($(basename "$part")); its answer, if any, is in ${part%.json}.result.json. Run decide again with the same file: what was done answers \"decided\"." >&2
        rm -f "${part%.json}.result.json"
        status=1
        break
      fi
      node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing")' "${part%.json}.result.json"
    done
    node -e '
      const fs = require("fs")
      const [parts, out] = process.argv.slice(1)
      const all = { counts: {}, results: [], bySource: [] }
      for (const name of fs.readdirSync(parts).filter((f) => f.endsWith(".result.json")).sort()) {
        const r = JSON.parse(fs.readFileSync(`${parts}/${name}`, "utf8"))
        for (const [k, n] of Object.entries(r.counts)) all.counts[k] = (all.counts[k] ?? 0) + n
        all.results.push(...r.results)
        all.bySource.push(...r.bySource)
      }
      fs.writeFileSync(out, JSON.stringify(all, null, 2))
      console.log(`This run: ${Object.entries(all.counts).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "nothing"}; results in ${out}`)' "$parts" "$parts/decided.json"
    exit "$status"
    ;;
  close)
    query=$([ "${2:-}" = --dry ] && echo '?dry=1' || true)
    "${SSH[@]}" "$CALL POST '/api/ops/jobs/close/$query'" < /dev/null
    ;;
  change)
    file=${2:?Name the changes file.}
    query=$([ "${3:-}" = --dry ] && echo '?dry=1' || true)
    "${SSH[@]}" "$CALL POST '/api/ops/jobs/change/$query'" < "$file"
    ;;
  report)
    here
    "${SSH[@]}" "$CALL GET /api/ops/jobs/report/" > "$dir/report.json"
    node -e '
      const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
      const g = r.gate, o = r.open
      console.log(`Open: ${o.positions}/${g.positions} positions, ${o.countries}/${g.countries} countries, ${o.subfields}/${g.subfields} subfields, ${o.institutions}/${g.institutions} institutions (${o.publishedByRoutine} published by the routine)`)
      console.log(`Waiting: ${r.waiting.total} candidates (${r.waiting.drafted} drafted); questions for the operator: ${r.questions.length}; manual sources due: ${r.manualDue.length}; link check: ${r.linkProblems.gone} gone, ${r.linkProblems.saysClosed} filled, ${r.linkProblems.broken} broken`)
      console.log(`Report in ${process.argv[1]}`)' "$dir/report.json"
    ;;
  clean)
    rm -rf update-jobs
    echo "Deleted update-jobs/."
    ;;
  *)
    sed -n '2,20p' "$0"
    exit 2
    ;;
esac
