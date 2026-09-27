#!/usr/bin/env bash
# Runs the whole hank from a terminal: checks, build, run (Mac kept awake), live progress, and a
# check that the app data was written. Run logs go to ~/hank-runs/boston-events-<date>/ (the newest
# KEEP_RUNS, default 5, are kept).
#
#   ./run.sh              everything on the local model (no API key needed)
#   ./run.sh --sonnet     spot-check, discover and scout on Claude Sonnet (needs ANTHROPIC_API_KEY)
#   ./run.sh --push       also commit and push app/data when the run succeeds
#   ./run.sh --dry-run    only the checks and the build
set -euo pipefail
cd "$(dirname "$0")"

MODEL=${MODEL:-pi/unsloth-hank/peculiar-ragdoll/Tiel-Coder-35B-A3B-MLX-oQ4e-MTP}
SONNET=0
PUSH=0
DRY=0
for arg in "$@"; do
  case $arg in
    --sonnet) SONNET=1 ;;
    --push) PUSH=1 ;;
    --dry-run) DRY=1 ;;
    -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (see --help)" >&2; exit 1 ;;
  esac
done

# 1. Checks
for cmd in node hankweave firecrawl curl; do
  command -v "$cmd" > /dev/null || { echo "missing: $cmd" >&2; exit 1; }
done
provider=$(node -e 'console.log(process.argv[1].split("/")[1])' "$MODEL")
base=$(node -e 'const p=require(process.argv[1]).providers?.[process.argv[2]];console.log(p?.baseUrl??"")' "$HOME/.pi/agent/models.json" "$provider" 2> /dev/null || true)
[ -n "$base" ] || { echo "no Pi provider \"$provider\" in ~/.pi/agent/models.json (see README)" >&2; exit 1; }
curl -s -o /dev/null --max-time 5 "$base/models" || { echo "local model server $base is not reachable; start Unsloth Studio" >&2; exit 1; }
firecrawl --status 2>&1 | grep -E 'Credits|Concurrency' || true
if [ "$SONNET" = 1 ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then echo "--sonnet needs ANTHROPIC_API_KEY" >&2; exit 1; fi
if command -v pmset > /dev/null && pmset -g batt | grep -q "Battery Power"; then
  echo "note: running on battery; plug in if you can, and keep the lid open"
fi

# 2. Build
if [ "$SONNET" = 1 ]; then
  node scripts/build-hank.mjs --source-model "$MODEL" --out hank.json
  HANK=hank.json
else
  node scripts/build-hank.mjs --source-model "$MODEL" --tail-model "$MODEL" --out hank-full-local.json
  HANK=hank-full-local.json
fi
# Keep the committed hank.json the default (Sonnet tail) build.
[ "$SONNET" = 1 ] || node scripts/build-hank.mjs --source-model "$MODEL" > /dev/null
codons=$(node -e 'console.log(require(process.argv[1]).hank.length)' "$PWD/$HANK")
[ "$DRY" = 1 ] && { echo "Dry run: $HANK has $codons codons."; exit 0; }

# 3. Run
mkdir -p "$HOME/hank-runs"
EXEC="$HOME/hank-runs/boston-events-$(date +%Y%m%d-%H%M)"
started=$(date +%s)
echo "Running $codons codons; log: $EXEC.log"
awake=""
command -v caffeinate > /dev/null && awake="caffeinate -dimsu"
# shellcheck disable=SC2086 # $awake is a command prefix, split on purpose
$awake hankweave "$HANK" data/ --headless --start-new -y -e "$EXEC" -o app/data --overwrite-output >> "$EXEC.log" 2>&1 &
hw=$!
trap 'kill $hw 2> /dev/null; exit 130' INT TERM

# 4. Progress: one line per finished codon, with the source's event count and status.
node - "$EXEC" "$codons" << 'EOF' &
const fs = require('fs');
const [exec, total] = [process.argv[2], Number(process.argv[3])];
const file = `${exec}/.hankweave/events/events.jsonl`;
let seen = 0, done = 0;
const timer = setInterval(() => {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('"codon.completed"'));
  for (const line of lines.slice(seen)) {
    const d = JSON.parse(line).data;
    let extra = '';
    if (d.codonId.startsWith('src-')) {
      const id = d.codonId.slice(4), root = `${exec}/agentRoot`;
      let n = '?', status = '?';
      try { n = JSON.parse(fs.readFileSync(`${root}/events/${id}.json`, 'utf8')).length; } catch {}
      try { status = fs.readFileSync(`${root}/notes/sources/${id}.md`, 'utf8').split('\n')[0].replace('status: ', ''); } catch {}
      extra = ` · ${n} events · ${status}`;
    }
    done++;
    console.log(`[${done}/${total}] ${d.codonId} ${d.success ? 'ok' : 'FAILED'} ${Math.round(d.duration / 1000)}s${extra}`);
  }
  seen = lines.length;
  if (done >= total) clearInterval(timer);
}, 5000);
EOF
progress=$!

# 5. Wait; Hankweave can linger after the last codon, so stop it two minutes after they all finish.
while kill -0 $hw 2> /dev/null; do
  sleep 15
  n=$(grep -c '"codon.completed"' "$EXEC/.hankweave/events/events.jsonl" 2> /dev/null || true)
  if [ "${n:-0}" -ge "$codons" ]; then sleep 120; kill $hw 2> /dev/null || true; break; fi
done
wait $hw 2> /dev/null || true
kill $progress 2> /dev/null || true

# Keep only the newest KEEP_RUNS run folders (and their logs) in ~/hank-runs.
KEEP_RUNS=${KEEP_RUNS:-5}
old_runs=$(ls -1d "$HOME"/hank-runs/boston-events-*/ 2> /dev/null | sed 's#/$##' | sort -r | tail -n +$((KEEP_RUNS + 1)))
for dir in $old_runs; do rm -rf "$dir" "$dir.log"; done

# 6. Result
if [ -f app/data/events.js ] && [ "$(stat -f %m app/data/events.js 2> /dev/null || stat -c %Y app/data/events.js)" -ge "$started" ]; then
  count=$(node -e 'console.log(require(process.argv[1]).length)' "$PWD/app/data/events.json")
  echo "Done in $(( ($(date +%s) - started) / 60 )) min: $count events in app/data. Open app/index.html; registry proposals are in app/data/proposed-sources.md."
else
  echo "The run did not write app/data/events.js. See $EXEC.log (tail -50) and $EXEC/agentRoot/notes/." >&2
  exit 1
fi

# 7. Publish
if [ "$PUSH" = 1 ]; then
  git add app/data
  git commit -q -m "Event data from the $(date +%Y-%m-%d) run" && git push -q && echo "Pushed app/data."
fi
