// Adds the events of a few sources, run on their own, to an existing app/data without redoing the
// whole merge (so the earlier spot-check's fixes and removals stay):
//   node scripts/add-sources.mjs <agentRoot of the small run> [app/data]
// Each source's events replace that source's old ones. Records are checked with the same rules as
// check.mjs; invalid ones and duplicates of events already there are skipped and reported.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { recordKey, recordProblems } from './record.mjs';

const [root, out = 'app/data'] = process.argv.slice(2);
if (!root) {
  console.error('usage: node scripts/add-sources.mjs <agentRoot> [app/data]');
  process.exit(1);
}
const window = JSON.parse(readFileSync(`${out}/window.json`, 'utf8'));
const { sources } = JSON.parse(readFileSync(`${root}/sources.json`, 'utf8'));
const ids = readdirSync(`${root}/events`).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const events = JSON.parse(readFileSync(`${out}/events.json`, 'utf8')).filter((e) => !ids.includes(e.sourceId));
const keys = new Set(events.map(recordKey));
for (const id of ids) {
  let added = 0;
  const skipped = [];
  for (const e of JSON.parse(readFileSync(`${root}/events/${id}.json`, 'utf8'))) {
    const r = { ...e, sourceId: id, source: e.source ?? sources.find((s) => s.id === id)?.name };
    if (r.endDate && r.date < window.start && r.endDate >= window.start) r.date = window.start;
    if (r.endDate && r.endDate <= r.date) delete r.endDate;
    const problems = recordProblems(r, window);
    if (keys.has(recordKey(r))) problems.push('already listed');
    if (problems.length) {
      skipped.push(`${r.title} (${r.date}): ${problems.join('; ')}`);
      continue;
    }
    keys.add(recordKey(r));
    events.push({ id: createHash('sha1').update(`${norm(r.title)}|${r.date}|${r.city}`).digest('hex').slice(0, 10), ...r });
    added++;
  }
  if (existsSync(`${root}/notes/sources/${id}.md`)) copyFileSync(`${root}/notes/sources/${id}.md`, `${out}/notes/sources/${id}.md`);
  console.log(`${id}: added ${added}${skipped.length ? `, skipped ${skipped.length}:\n  - ${skipped.join('\n  - ')}` : ''}`);
}
events.sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
writeFileSync(`${out}/events.json`, JSON.stringify(events, null, 2) + '\n');
writeFileSync(`${out}/events.js`, `window.EVENTS_DATA = ${JSON.stringify({ generatedAt: new Date().toISOString(), window, events }, null, 2)};\n`);
console.log(`${out}: ${events.length} events.`);
