// Merges events/*.json into events.json, then flags events for the spot-check agent.
//   - drops malformed records and out-of-window dates (reported in notes/merge.md)
//   - dedupes exact matches (same title, date, city), keeping the most complete record
//   - checks every url, and flags dead links, listing-page urls, missing times and near-duplicates
// Writes events.json, flagged.json, notes/merge.md and notes/coverage.md.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expandUrl } from './page.mjs';
import { recordProblems } from './record.mjs';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const window = JSON.parse(readFileSync('window.json', 'utf8'));
const { sources } = JSON.parse(readFileSync('sources.json', 'utf8'));
const listingUrls = new Set(sources.flatMap((s) => s.urls).map((u) => normUrl(expandUrl(u, window))));
// Registry sites were already read through Firecrawl, so a bot-blocking status from them is not a dead link.
const sourceHosts = new Set(sources.flatMap((s) => s.urls).map((u) => new URL(u).hostname));
const BOT_BLOCK = /^returned HTTP (401|403|406|429)$/;
const log = [];

// 0. Join any source whose agent saved part files but never ran join.mjs.
if (existsSync('events/parts')) {
  const withParts = new Set(readdirSync('events/parts').map((f) => f.match(/^([a-z0-9-]+)-\d+\.json$/)?.[1]).filter(Boolean));
  for (const id of withParts) {
    if (existsSync(`events/${id}.json`)) continue;
    const r = spawnSync('node', ['join.mjs', id], { encoding: 'utf8' });
    log.push(r.status === 0 ? `Joined unjoined parts: ${r.stdout.trim()}` : `Could not join ${id}'s parts: ${(r.stderr || '').trim().slice(0, 300)}`);
  }
}

// 1. Load
const all = [];
const perSource = {};
for (const f of existsSync('events') ? readdirSync('events').filter((f) => f.endsWith('.json')) : []) {
  const sourceId = f.replace(/\.json$/, '');
  try {
    const list = JSON.parse(readFileSync(`events/${f}`, 'utf8'));
    if (!Array.isArray(list)) throw new Error('not an array');
    perSource[sourceId] = list.length;
    for (const e of list) all.push({ ...e, sourceId });
  } catch (err) {
    log.push(`Skipped events/${f}: ${err.message}`);
    perSource[sourceId] = 'unreadable';
  }
}

// 2. Validate + window filter. A run already on when the window opens starts on its first day;
// an endDate no later than date means a one-day event.
const valid = all.filter((e) => {
  if (e.endDate && e.date < window.start && e.endDate >= window.start) e.date = window.start;
  if (e.endDate && e.endDate <= e.date) delete e.endDate;
  const problems = recordProblems(e, window);
  if (problems.length) log.push(`Dropped invalid record from ${e.sourceId}: ${e.title ?? 'untitled'} (${e.date ?? 'no date'}): ${problems.join('; ')}`);
  return !problems.length;
});

// 3. Exact dedupe
const byKey = new Map();
for (const e of valid) {
  const key = `${norm(e.title)}|${e.date}|${e.city}`;
  const prev = byKey.get(key);
  if (!prev || filled(e) > filled(prev)) byKey.set(key, e);
  if (prev) log.push(`Merged duplicate "${e.title}" (${e.date}, ${e.city}) from ${prev.sourceId} and ${e.sourceId}`);
}
const events = [...byKey.values()]
  .map((e) => ({ id: createHash('sha1').update(`${norm(e.title)}|${e.date}|${e.city}`).digest('hex').slice(0, 10), ...e }))
  .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));

// 4. Flags
const flags = new Map(events.map((e) => [e.id, []]));
const status = await checkUrls([...new Set(events.map((e) => e.url))]);
for (const e of events) {
  const s = status.get(e.url);
  if (s !== 'ok' && !(BOT_BLOCK.test(s) && sourceHosts.has(new URL(e.url).hostname))) flags.get(e.id).push(`url ${s}`);
  if (listingUrls.has(normUrl(e.url))) flags.get(e.id).push('url is a source listing page, not the event page');
  if (!e.startTime) flags.get(e.id).push('no start time');
}
for (let i = 0; i < events.length; i++) {
  for (let j = i + 1; j < events.length && events[j].date === events[i].date; j++) {
    const [a, b] = [events[i], events[j]];
    if (a.city !== b.city) continue;
    const [ta, tb] = [norm(a.title), norm(b.title)];
    if (ta.includes(tb) || tb.includes(ta) || ta.slice(0, 20) === tb.slice(0, 20)) {
      flags.get(b.id).push(`possible duplicate of ${a.id} "${a.title}"`);
    }
  }
}
const flagged = events.filter((e) => flags.get(e.id).length).map((e) => ({ id: e.id, title: e.title, date: e.date, city: e.city, url: e.url, reasons: flags.get(e.id) }));

// 5. Write
writeFileSync('events.json', JSON.stringify(events, null, 2) + '\n');
writeFileSync('flagged.json', JSON.stringify(flagged, null, 2) + '\n');
writeFileSync('notes/merge.md', `# Merge\n\n${all.length} raw → ${valid.length} valid → ${events.length} after dedupe; ${flagged.length} flagged.\n\n${log.map((l) => `- ${l}`).join('\n')}\n`);

const grid = window.cities.map((c) => [c, ...window.categories.map((k) => events.filter((e) => e.city === c && e.category === k).length)]);
const cov = [
  '# Coverage',
  '',
  `Window ${window.start} → ${window.end}. Target: at least ${window.minEventsPerCity} events per city.`,
  '',
  `| City | Total | ${window.categories.join(' | ')} |`,
  `|---|---|${window.categories.map(() => '---').join('|')}|`,
  ...grid.map(([c, ...n]) => `| ${c} | ${n.reduce((a, b) => a + b, 0)} | ${n.join(' | ')} |`),
  '',
  '## Events per source (before merge)',
  '',
  ...sources.map((s) => `- ${s.id}: ${perSource[s.id] ?? 'no file'}`),
].join('\n');
writeFileSync('notes/coverage.md', cov + '\n');
console.log(`Merged ${events.length} events; ${flagged.length} flagged for spot-check.`);

// --- helpers ------------------------------------------------------------------------

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function normUrl(u) {
  return u.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
}
function filled(e) {
  return Object.values(e).filter((v) => v !== undefined && v !== '').length;
}
async function checkUrls(urls) {
  const result = new Map();
  const queue = [...urls];
  const headers = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' };
  await Promise.all(Array.from({ length: 10 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
        res.body?.cancel();
        // 401/403/406/429 usually mean bot blocking, not a dead page; let the agent judge.
        result.set(url, res.ok ? 'ok' : `returned HTTP ${res.status}`);
      } catch (err) {
        result.set(url, `unreachable (${err.cause?.code ?? err.name})`);
      }
    }
  }));
  return result;
}
