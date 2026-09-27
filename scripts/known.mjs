// Events already found by the per-source codons, so the web-search codon can skip them:
//   node known.mjs            writes known-events.txt (date | city | title)
//   node known.mjs "<title>"  prints known events whose titles share words with <title>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const query = process.argv.slice(2).join(' ').trim();

if (!query) {
  const files = existsSync('events') ? readdirSync('events').filter((f) => f.endsWith('.json') && f !== 'web-search.json') : [];
  const lines = [];
  for (const f of files) {
    try {
      for (const e of JSON.parse(readFileSync(`events/${f}`, 'utf8'))) lines.push(`${e.date} | ${e.city} | ${e.title}`);
    } catch {
      // A malformed per-source file is reported by merge.mjs; skip it here.
    }
  }
  lines.sort();
  writeFileSync('known-events.txt', lines.join('\n') + '\n');
  console.log(`known-events.txt: ${lines.length} events from ${files.length} sources.`);
  process.exit(0);
}

const STOP = new Set(['the', 'and', 'of', 'at', 'in', 'on', 'a', 'an', 'for', 'with', 'to', 'by', 'from', 'boston', 'ma', '2026', 'annual', 'event', 'events']);
const words = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const want = words(query);
const known = existsSync('known-events.txt') ? readFileSync('known-events.txt', 'utf8').split('\n').filter(Boolean) : [];
const hits = known
  .map((line) => {
    const have = words(line.split(' | ')[2] ?? '');
    const shared = [...want].filter((w) => have.has(w)).length;
    return { line, score: shared / Math.max(1, Math.min(want.size, have.size)) };
  })
  .filter((h) => h.score >= 0.5)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);
console.log(hits.length ? `Possibly already known:\n${hits.map((h) => `  ${h.line}`).join('\n')}` : `Not known: no known event resembles "${query}".`);
