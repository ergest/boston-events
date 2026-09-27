// Generates hank.json from data/sources.json: one codon per source, then the fixed tail
// (web search → merge + spot-check → scout + export). Run from the hank directory:
//   node scripts/build-hank.mjs                                 # full hank → hank.json
//   node scripts/build-hank.mjs --only mit,ica --no-tail --out trial.json
//   node scripts/build-hank.mjs --source-model haiku            # run source codons on cloud Haiku
//   node scripts/build-hank.mjs --tail-model pi/unsloth-hank/<model>  # run web-search/spot-check/scout locally too
//   node scripts/build-hank.mjs --only boston-calendar --reuse <old agentRoot> --no-web-search
//       # finish from an earlier run's per-source events, refetching only the listed sources
// hank.json is generated; edit this script or sources.json instead.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';

// Source codons run on a local model served by Unsloth Studio through Pi (~/.pi/agent/models.json).
// The unsloth-hank provider is the same server with hank-only limits: a small contextWindow so Pi
// compacts early (local models slow down on long context) and every thinking level mapped to "low".
const DEFAULT_SOURCE_MODEL = 'pi/unsloth-hank/peculiar-ragdoll/Tiel-Coder-35B-A3B-MLX-oQ4e-MTP';
// Pi codons may compact; without it a codon that outgrows the small window fails instead.
const compaction = (model) => (model.startsWith('pi/') ? { autoCompact: true } : {});

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    'source-model': { type: 'string', default: DEFAULT_SOURCE_MODEL },
    'tail-model': { type: 'string', default: 'sonnet' },
    'no-tail': { type: 'boolean', default: false },
    'no-web-search': { type: 'boolean', default: false },
    reuse: { type: 'string' },
    out: { type: 'string', default: 'hank.json' },
  },
});
const sourceModel = args['source-model'];
const tailModel = args['tail-model'];

const { sources: registry } = JSON.parse(readFileSync('data/sources.json', 'utf8'));
const TYPE_ORDER = ['aggregator', 'civic', 'university', 'venue'];

// Validate the registry before generating anything.
const problems = [];
const ids = new Set();
for (const s of registry) {
  if (!/^[a-z0-9-]+$/.test(s.id ?? '')) problems.push(`bad id "${s.id}" (use lowercase, digits, dashes)`);
  if (s.id === 'web-search') problems.push('"web-search" is reserved');
  if (ids.has(s.id)) problems.push(`duplicate id "${s.id}"`);
  ids.add(s.id);
  if (!TYPE_ORDER.includes(s.type)) problems.push(`${s.id}: type must be one of ${TYPE_ORDER.join(', ')}`);
  if (!['ics', 'page'].includes(s.fetch)) problems.push(`${s.id}: fetch must be "ics" or "page"`);
  if (!Array.isArray(s.urls) || !s.urls.length) problems.push(`${s.id}: urls must be a nonempty array`);
  if (s.cities !== 'all' && !Array.isArray(s.cities)) problems.push(`${s.id}: cities must be "all" or an array`);
}
const only = args.only?.split(',').map((s) => s.trim()).filter(Boolean); // --only '' with --reuse: no source codons
for (const id of only ?? []) if (!ids.has(id)) problems.push(`--only: no source "${id}"`);
if (problems.length) {
  console.error('Problems:\n- ' + problems.join('\n- '));
  process.exit(1);
}
const sources = only ? registry.filter((s) => only.includes(s.id)) : registry;

// Every source codon carries the idempotent setup, so the run works even if an early source codon fails.
const setup = [
  ...['window', 'pagetrim', 'page', 'firecrawl', 'fetch-source', 'fetch-detail', 'chunk', 'check', 'join', 'known', 'search', 'merge', 'flag', 'export'].map((f) => ({ type: 'copy', copy: { from: `scripts/${f}.mjs`, to: `${f}.mjs` } })),
  { type: 'copy', copy: { from: 'data/config.json', to: 'config.json' } },
  { type: 'copy', copy: { from: 'data/sources.json', to: 'sources.json' } },
  { type: 'command', command: { run: 'test -f window.json || node window.mjs' } },
];

// --reuse seeds this run with the per-source events and notes of an earlier run's agentRoot.
if (args.reuse && !existsSync(`${args.reuse}/events`)) {
  console.error(`--reuse: no events/ in ${args.reuse}`);
  process.exit(1);
}
const reuse = args.reuse
  ? [{ type: 'command', command: { run: `mkdir -p events notes/sources && cp ${args.reuse}/events/*.json events/ && cp ${args.reuse}/notes/sources/*.md notes/sources/` } }]
  : [];

// For a local Pi model, a preflight codon checks that the server is up and the model answers,
// and aborts the run before anything else is spent.
const preflight = [];
const piMatch = sourceModel.match(/^pi\/([^/]+)\//);
if (piMatch) {
  const provider = piMatch[1];
  const piModels = `${homedir()}/.pi/agent/models.json`;
  const baseUrl = existsSync(piModels) ? JSON.parse(readFileSync(piModels, 'utf8')).providers?.[provider]?.baseUrl : undefined;
  if (!baseUrl) {
    console.error(`No baseUrl for Pi provider "${provider}" in ${piModels}`);
    process.exit(1);
  }
  preflight.push({
    id: 'preflight',
    name: `Preflight: local model server (${provider})`,
    description: `Checks ${baseUrl} is reachable and ${sourceModel} answers before any source codon runs.`,
    model: sourceModel,
    continuationMode: 'fresh',
    promptText: 'Reply with the single word: ready',
    rigSetup: [
      {
        type: 'command',
        command: {
          run: `code=$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' ${baseUrl}/models); [ "$code" != "000" ] || { echo 'Local model server ${baseUrl} is not reachable. Start it (Unsloth Studio) and rerun.' >&2; exit 1; }`,
        },
      },
      ...setup,
      ...reuse,
    ],
    onFailure: 'abort',
    budget: { maxTimeSeconds: 300 },
  });
}

const ordered = [...sources].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));

const sourceCodons = ordered.map((s) => ({
  id: `src-${s.id}`,
  name: `${s.type}: ${s.name}`,
  description: `Extract events from ${s.name} (${s.fetch}).`,
  model: sourceModel,
  ...compaction(sourceModel),
  continuationMode: 'fresh',
  promptFile: './prompts/source.md',
  appendSystemPromptText: `This codon handles source "${s.id}" (${s.name}).`,
  rigSetup: [...setup, { type: 'command', command: { run: `node fetch-source.mjs ${s.id}` } }],
  checkpointedFiles: [`events/${s.id}.json`, `events/parts/${s.id}-*.json`, `notes/sources/${s.id}.md`],
  onFailure: 'ignore',
  budget: { ...(piMatch ? { maxTimeSeconds: 1500 } : { maxDollars: 0.3, maxTimeSeconds: 600 }), onExceeded: 'complete' },
}));

const webSearch = [
  {
    id: 'web-search',
    name: 'Search the web for events the registry missed',
    model: tailModel,
    ...compaction(tailModel),
    continuationMode: 'fresh',
    promptFile: './prompts/search.md',
    // search.mjs serves a fixed list of queries one at a time and caps Firecrawl use.
    rigSetup: [...setup, { type: 'command', command: { run: 'mkdir -p events notes/sources && rm -rf search events/parts/web-search-*.json && node known.mjs' } }],
    checkpointedFiles: ['events/web-search.json', 'events/parts/web-search-*.json', 'search/*', 'notes/web-search.md'],
    onFailure: 'ignore',
    budget: { maxDollars: 1.5, maxTimeSeconds: 1200, onExceeded: 'complete' },
  },
];

const tail = [
  ...(args['no-web-search'] ? [] : webSearch),
  {
    id: 'spot-check',
    name: 'Merge, then spot-check flagged events',
    model: tailModel,
    ...compaction(tailModel),
    continuationMode: 'fresh',
    promptFile: './prompts/spot-check.md',
    rigSetup: [
      { type: 'copy', copy: { from: 'scripts/flag.mjs', to: 'flag.mjs' } },
      // Joins web-search parts first, in case web-search ran out of time before joining them.
      { type: 'command', command: { run: 'if ls events/parts/web-search-*.json > /dev/null 2>&1; then node join.mjs web-search; fi; rm -rf spot && node merge.mjs && node check.mjs' } },
    ],
    checkpointedFiles: ['events.json', 'flagged.json', 'spot/*.json', 'notes/*.md'],
    // flag.mjs applies each decision as it goes; if this codon fails, scout and export use what is done.
    onFailure: 'ignore',
    // Over budget, the run goes on with the events fixed so far; unresolved flags stay as they are.
    budget: { maxDollars: 1.5, maxTimeSeconds: tailModel.startsWith('pi/') ? 2400 : 1200, onExceeded: 'complete' },
  },
  {
    id: 'scout',
    name: 'Propose registry changes',
    model: tailModel,
    ...compaction(tailModel),
    continuationMode: 'fresh',
    promptFile: './prompts/scout.md',
    // Applies spot-check's last decision if the agent wrote it but never ran flag.mjs again.
    rigSetup: [{ type: 'command', command: { run: 'test ! -f flag.mjs || node flag.mjs > /dev/null 2>&1 || true' } }],
    checkpointedFiles: ['proposed-sources.md'],
    budget: { maxDollars: 1, maxTimeSeconds: 900, onExceeded: 'complete' },
    outputFiles: [
      {
        beforeCopy: [{ type: 'command', command: { run: 'node check.mjs && node export.mjs && test -s proposed-sources.md' } }],
        copy: ['events.js', 'events.json', 'flagged.json', 'window.json', 'proposed-sources.md', 'notes/**/*.md'],
      },
    ],
  },
];

const sourceDollars = piMatch ? 0 : sources.length * 0.3;
const tailDollars = tailModel.startsWith('pi/') ? 0 : 4;
const hank = {
  $schema: 'https://unpkg.com/hankweave@0.10.0/schemas/hank.schema.json',
  meta: {
    name: 'Greater Boston Events',
    version: '0.3.0',
    description: `Collects upcoming events in Greater Boston from ${sources.length} registered sources (source codons on ${sourceModel}) plus open web search, spot-checks them, proposes registry changes, and exports data for the local events app. GENERATED by scripts/build-hank.mjs; do not edit by hand.`,
  },
  globalSystemPromptFile: './prompts/system.md',
  overrides: {
    budget: { maxDollars: Math.max(1, Math.ceil(sourceDollars + tailDollars)), maxTimeSeconds: 4 * 3600, onExceeded: 'fail' },
  },
  hank: [...preflight, ...sourceCodons, ...(args['no-tail'] ? [] : tail)],
};

writeFileSync(args.out, JSON.stringify(hank, null, 2) + '\n');
console.log(`${args.out}: ${preflight.length ? 'preflight + ' : ''}${sourceCodons.length} source codons on ${sourceModel}${args['no-tail'] ? '' : ` + ${args['no-web-search'] ? '' : 'web-search, '}spot-check, scout on ${tailModel}`}.`);
