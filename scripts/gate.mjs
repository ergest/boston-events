// Last check before the run's data is copied to app/data. Run from the agentRoot after merge.mjs.
//   node gate.mjs
// Fails (exit 1, so the copy is skipped and app/data keeps the last good run) when
//   - more than 10% of the registry's sources never ran (no notes/sources/<id>.md): a spent budget
//     makes later codons finish in seconds at $0 with nothing extracted, and they look like successes;
//   - the merged event count fell below 70% of the previous run's.
// Warns (listed in notes/gate.md, which is copied with the data) when a source that had events last
// time now has none or under half, so a blocked or restructured site is visible in the diff.
// The previous run is previous-coverage.md, a copy of the published notes/coverage.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const MAX_MISSING_SHARE = 0.1;
const MIN_TOTAL_SHARE = 0.7;
const MIN_PREVIOUS_FOR_DROP = 20;
const MIN_SHARE_PER_SOURCE = 0.5;

const { sources } = JSON.parse(readFileSync('sources.json', 'utf8'));
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : undefined);

// This run: per-source event counts and status lines.
const now = {};
for (const s of sources) {
  const notes = read(`notes/sources/${s.id}.md`);
  let count;
  try {
    count = JSON.parse(read(`events/${s.id}.json`) ?? 'null')?.length;
  } catch {}
  now[s.id] = { ran: notes !== undefined, count, status: notes?.split('\n')[0].replace('status: ', ''), why: notes?.split('\n').slice(1).join(' ').trim().slice(0, 160) };
}

// Previous run, from the coverage notes it published.
const prevCoverage = read('previous-coverage.md');
const prev = {};
let prevTotal;
if (prevCoverage) {
  for (const m of prevCoverage.matchAll(/^- ([a-z0-9-]+): (\d+)$/gm)) prev[m[1]] = Number(m[2]);
  const rows = [...prevCoverage.matchAll(/^\| ([^|]+) \| (\d+) \|/gm)].filter((m) => m[1].trim() !== 'City');
  if (rows.length) prevTotal = rows.reduce((n, m) => n + Number(m[2]), 0);
}
const total = JSON.parse(readFileSync('events.json', 'utf8')).length;

// merge.mjs wrote notes/coverage.md before spot-check removed and fixed events, so its city table
// is stale by now. Rebuild the table from the final events; the per-source section stays as written.
const finalEvents = JSON.parse(readFileSync('events.json', 'utf8'));
const window = JSON.parse(readFileSync('window.json', 'utf8'));
const coverage = read('notes/coverage.md');
if (coverage) {
  const grid = window.cities.map((c) => [c, ...window.categories.map((k) => finalEvents.filter((e) => e.city === c && e.category === k).length)]);
  const table = [
    `| City | Total | ${window.categories.join(' | ')} |`,
    `|---|---|${window.categories.map(() => '---').join('|')}|`,
    ...grid.map(([c, ...n]) => `| ${c} | ${n.reduce((a, b) => a + b, 0)} | ${n.join(' | ')} |`),
  ].join('\n');
  writeFileSync('notes/coverage.md', coverage.replace(/^\| City \|[\s\S]*?(?=\n\n)/m, table));
}

const failures = [];
const warnings = [];

const missing = sources.filter((s) => !now[s.id].ran).map((s) => s.id);
const allowedMissing = Math.floor(sources.length * MAX_MISSING_SHARE);
if (missing.length > allowedMissing) {
  failures.push(`${missing.length} of ${sources.length} sources never ran (more than ${allowedMissing} allowed), likely a spent budget or a crashed run: ${missing.join(', ')}`);
} else if (missing.length) {
  warnings.push(`${missing.length} source(s) never ran: ${missing.join(', ')}`);
}

if (prevTotal !== undefined && total < prevTotal * MIN_TOTAL_SHARE) {
  failures.push(`merged events fell from ${prevTotal} to ${total} (below ${Math.round(MIN_TOTAL_SHARE * 100)}% of the previous run)`);
}

for (const s of sources) {
  const n = now[s.id];
  if (!n.ran) continue;
  const before = prev[s.id];
  if (before !== undefined && before >= MIN_PREVIOUS_FOR_DROP && (n.count ?? 0) < before * MIN_SHARE_PER_SOURCE) {
    warnings.push(`${s.id}: ${before} events last run, ${n.count ?? 'none'} now${n.status && n.status !== 'ok' ? ` (status ${n.status}: ${n.why})` : ''}`);
  } else if (n.status === 'broken') {
    warnings.push(`${s.id}: status broken (${n.why})`);
  }
}

const report = [
  '# Gate',
  '',
  `${total} merged events${prevTotal !== undefined ? ` (previous run ${prevTotal})` : ''}; ${sources.length - missing.length} of ${sources.length} sources ran.`,
  '',
  ...(failures.length ? ['## Failures', '', ...failures.map((f) => `- ${f}`), ''] : []),
  ...(warnings.length ? ['## Warnings', '', ...warnings.map((w) => `- ${w}`), ''] : []),
  ...(!failures.length && !warnings.length ? ['No problems found.', ''] : []),
].join('\n');
writeFileSync('notes/gate.md', report);
console.log(report);
if (failures.length) {
  console.error('Gate failed: the data was not published. Fix the sources above, or finish the run with --only <ids> --reuse <this agentRoot>.');
  process.exit(1);
}
