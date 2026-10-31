// Free check to run before a hank run (fetching costs nothing; only extraction costs money):
//   node scripts/preflight.mjs [--against <previous agentRoot>] [--only a,b] [--jobs 4]
// Fetches every registry source the way its codon will, in a scratch directory, and reports
//   - dead sources: a fetch error (403, timeout, unparseable listing) or no content at all;
//   - with --against, which sources fetched byte-identical content to that run's chunks/ (same
//     window, same input), so their events/ and notes can be reused instead of paying to extract again.
// Writes preflight.md and preflight.json next to the scratch directory and prints the build-hank
// command for the sources that need extracting. Exit code 1 if any source is dead.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: { against: { type: 'string' }, only: { type: 'string' }, jobs: { type: 'string', default: '4' }, dir: { type: 'string' } },
});
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = args.dir ? resolve(args.dir) : join(tmpdir(), 'boston-events-preflight');
const { sources: registry } = JSON.parse(readFileSync(join(root, 'data/sources.json'), 'utf8'));
const only = args.only?.split(',').map((s) => s.trim()).filter(Boolean);
const sources = only ? registry.filter((s) => only.includes(s.id)) : registry;

// The scratch dir looks like an agentRoot: the scripts, the registry, config, and a fresh window.
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(join(root, 'scripts')).filter((f) => f.endsWith('.mjs'))) cpSync(join(root, 'scripts', f), join(dir, f));
cpSync(join(root, 'data/sources.json'), join(dir, 'sources.json'));
cpSync(join(root, 'data/config.json'), join(dir, 'config.json'));
await run('node', ['window.mjs']);
const window = JSON.parse(readFileSync(join(dir, 'window.json'), 'utf8'));

function run(cmd, cmdArgs) {
  return new Promise((res) => {
    const p = spawn(cmd, cmdArgs, { cwd: dir, stdio: 'ignore' });
    p.on('close', res);
    p.on('error', res);
  });
}

// Hash of everything an agent would read for a source: its chunk files, in order.
function hashChunks(base, id) {
  const d = join(base, 'chunks', id);
  if (!existsSync(d)) return { chunks: 0 };
  const files = readdirSync(d).filter((f) => !f.startsWith('.')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(readFileSync(join(d, f)));
  return { chunks: files.length, hash: files.length ? h.digest('hex').slice(0, 16) : undefined };
}

const results = {};
const queue = [...sources];
async function worker() {
  for (let s; (s = queue.shift()); ) {
    const t0 = Date.now();
    await run('node', ['fetch-source.mjs', s.id]);
    const errFile = join(dir, 'raw', s.id, 'FETCH_ERROR.txt');
    const error = existsSync(errFile) ? readFileSync(errFile, 'utf8').trim().split('\n')[0].slice(0, 200) : undefined;
    results[s.id] = { ...hashChunks(dir, s.id), error, seconds: Math.round((Date.now() - t0) / 1000) };
  }
}
await Promise.all(Array.from({ length: Number(args.jobs) }, worker));

const prevBase = args.against ? resolve(args.against) : undefined;
if (prevBase && !existsSync(join(prevBase, 'events'))) {
  console.error(`--against: no events/ in ${prevBase}`);
  process.exit(2);
}
// An earlier extraction only kept events up to its own window's end. Reusing it for a later window
// would silently miss the newer days, so reuse needs that window to reach at least as far as this one.
const prevWindow = prevBase && existsSync(join(prevBase, 'window.json')) ? JSON.parse(readFileSync(join(prevBase, 'window.json'), 'utf8')) : undefined;
const windowCovers = prevWindow && prevWindow.start <= window.start && prevWindow.end >= window.end;
if (prevBase && !windowCovers) console.log(`Not reusing anything: ${prevBase} covered ${prevWindow?.start} → ${prevWindow?.end}, this window is ${window.start} → ${window.end}.\n`);
const dead = [];
const partial = [];
const unchanged = [];
const changed = [];
const rows = [];
for (const s of sources) {
  const r = results[s.id];
  let verdict;
  if (!r.chunks) {
    verdict = r.error ? 'DEAD' : 'EMPTY';
    dead.push(s.id);
  } else if (r.error) {
    // Some pages loaded, others failed (rate limit, 403): extract what loaded, but say so.
    verdict = 'PARTIAL';
    partial.push(s.id);
    changed.push(s.id);
  } else if (prevBase) {
    const prev = hashChunks(prevBase, s.id);
    const reusable = windowCovers && prev.hash === r.hash && existsSync(join(prevBase, 'events', `${s.id}.json`)) && existsSync(join(prevBase, 'notes/sources', `${s.id}.md`));
    verdict = reusable ? 'same' : prev.hash ? 'changed' : 'new';
    (reusable ? unchanged : changed).push(s.id);
  } else {
    verdict = 'ok';
    changed.push(s.id);
  }
  rows.push({ id: s.id, verdict, chunks: r.chunks, hash: r.hash, seconds: r.seconds, error: r.error });
}

const report = [
  `# Preflight ${window.start} → ${window.end}`,
  '',
  `${sources.length} sources fetched; ${dead.length} dead or empty, ${partial.length} partial${prevBase ? `; ${unchanged.length} identical to ${prevBase}` : ''}.`,
  '',
  '| Source | Verdict | Chunks | Fetch s | Note |',
  '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.verdict} | ${r.chunks} | ${r.seconds} | ${r.error ?? ''} |`),
  '',
].join('\n');
writeFileSync(join(dir, 'preflight.md'), report);
writeFileSync(join(dir, 'preflight.json'), JSON.stringify({ window, rows, dead, partial, unchanged, changed }, null, 2) + '\n');

console.log(report);
if (dead.length) console.log(`Dead or empty: ${dead.join(', ')}. A run would pay for nothing on these; fix or remove them first.\n`);
if (partial.length) console.log(`Partial fetch (some pages failed, e.g. a rate limit; a run fetches one source at a time, so it may do better): ${partial.join(', ')}\n`);
if (prevBase) {
  console.log(`Extract only the ${changed.length} changed sources and reuse the ${unchanged.length} identical ones (their per-source events and notes come from ${prevBase}):`);
  console.log(`  node scripts/build-hank.mjs --source-model haiku --heavy-model sonnet --max-dollars 40 --only ${changed.filter((id) => !dead.includes(id)).join(',')} --reuse ${prevBase} --out hank-incremental.json`);
}
console.log(`Report: ${join(dir, 'preflight.md')}`);
process.exit(dead.length ? 1 : 0);
