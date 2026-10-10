#!/usr/bin/env bash
# Runs the hank on cloud Claude 5.5 models with the Claude Code login (no API key, no local model):
# Haiku 5.5 for sources, Sonnet 5.5 for "heavy" sources and spot-check/discover/scout.
# Patches the installed Hankweave first if needed (see scripts/patch-hankweave.mjs).
#
#   scripts/run-55.sh                         full run → app/data
#   scripts/run-55.sh --only mfa --no-tail    extra args go to build-hank.mjs (trial; app/data untouched)
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/patch-hankweave.mjs
export HW_INTERNAL_CLAUDE_LEGACY_AUTH=${HW_INTERNAL_CLAUDE_LEGACY_AUTH:-1}

HANK=hank-55.json
node scripts/build-hank.mjs --source-model anthropic/claude-haiku-5-5 --heavy-model anthropic/claude-sonnet-5-5 \
  --tail-model anthropic/claude-sonnet-5-5 --out "$HANK" "$@"
hankweave "$HANK" data/ --validate > /dev/null 2>&1 || { hankweave "$HANK" data/ --validate; exit 1; }

# Only a full run (no extra args) writes app/data.
out=()
[ $# -eq 0 ] && out=(-o app/data --overwrite-output)
mkdir -p "$HOME/hank-runs"
EXEC="$HOME/hank-runs/boston-events-55-$(date +%Y%m%d-%H%M)"
echo "Running $HANK; log: $EXEC.log"
awake=""
command -v caffeinate > /dev/null && awake="caffeinate -dimsu"
# shellcheck disable=SC2086 # $awake is a command prefix, split on purpose
$awake hankweave "$HANK" data/ --headless --start-new -y -e "$EXEC" ${out[@]+"${out[@]}"} > "$EXEC.log" 2>&1 || true

# One line per codon: status, time, cost, and events for source codons.
node - "$EXEC" << 'EOF'
const fs = require('fs');
const zlib = require('zlib');
const exec = process.argv[2];
// Hankweave 0.12 compresses the journal once the run ends; older versions leave it plain.
const plain = `${exec}/.hankweave/events/events.jsonl`;
const journal = fs.existsSync(plain)
  ? fs.readFileSync(plain, 'utf8')
  : zlib.zstdDecompressSync(fs.readFileSync(`${plain}.zst`)).toString('utf8');
let total = 0;
for (const line of journal.split('\n')) {
  if (!line.includes('"codon.completed"')) continue;
  const d = JSON.parse(line).data;
  let extra = '';
  if (d.codonId.startsWith('src-')) {
    const id = d.codonId.slice(4);
    try { extra = ` · ${JSON.parse(fs.readFileSync(`${exec}/agentRoot/events/${id}.json`, 'utf8')).length} events`; } catch { extra = ' · no events file'; }
  }
  total += d.cost ?? 0;
  console.log(`${d.codonId} ${d.success ? 'ok' : 'FAILED'} ${Math.round(d.duration / 1000)}s $${(d.cost ?? 0).toFixed(2)}${extra}`);
}
console.log(`total $${total.toFixed(2)}; run folder ${exec}`);
EOF
