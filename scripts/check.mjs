// Checks the shape of an events file against window.json.
//   node check.mjs                      → events.json (merged; must be nonempty)
//   node check.mjs events/<id>.json     → one source's file (may be an empty array)
// It verifies structure and dates and, for a source's file, that values are grounded in raw/<id>/.
// It does not verify that an event is real.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'events.json';
const allowEmpty = file !== 'events.json';
const window = JSON.parse(readFileSync('window.json', 'utf8'));

let events;
try {
  events = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`${file}: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(events) || (!allowEmpty && events.length === 0)) {
  console.error(`${file} must be a JSON array${allowEmpty ? '' : ' with at least one event'}`);
  process.exit(1);
}

const required = ['title', 'city', 'venue', 'date', 'category', 'url', 'source'];
const optionalStrings = ['id', 'address', 'startTime', 'endTime', 'price', 'registerUrl', 'description', 'sourceId'];
const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const seen = new Set();
const problems = [];

events.forEach((e, i) => {
  const at = `[${i}] ${e?.title ?? 'untitled'}`;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return problems.push(`${at}: not an object`);
  for (const f of required) {
    if (typeof e[f] !== 'string' || !e[f].trim()) problems.push(`${at}: ${f} must be a nonempty string`);
  }
  for (const f of optionalStrings) {
    if (e[f] !== undefined && typeof e[f] !== 'string') problems.push(`${at}: ${f} must be a string if present`);
  }
  if (!window.cities.includes(e.city)) problems.push(`${at}: city "${e.city}" is not one of: ${window.cities.join(', ')}`);
  if (!window.categories.includes(e.category)) problems.push(`${at}: category "${e.category}" is not one of: ${window.categories.join(', ')}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '')) problems.push(`${at}: date must be YYYY-MM-DD`);
  else if (e.date < window.start || e.date > window.end) problems.push(`${at}: date ${e.date} is outside ${window.start}..${window.end}`);
  for (const f of ['startTime', 'endTime']) {
    if (e[f] !== undefined && !time.test(e[f])) problems.push(`${at}: ${f} must be 24h HH:MM`);
  }
  if (e.endTime && !e.startTime) problems.push(`${at}: endTime needs a startTime`);
  for (const f of ['url', 'registerUrl']) {
    if (e[f] !== undefined && !/^https?:\/\//.test(e[f])) problems.push(`${at}: ${f} must start with http(s)://`);
  }
  const key = `${(e.title ?? '').toLowerCase().trim()}|${e.date}|${e.city}`;
  if (seen.has(key)) problems.push(`${at}: duplicate (same title, date and city as an earlier event)`);
  seen.add(key);
});

// Grounding: for a registry source's file, every value must come from what the rig fetched
// (full copies in ground/<id>/, plus detail pages the agent saved into raw/<id>/). Catches
// invented URLs, dates and times.
const sourceId = file.match(/^events\/([a-z0-9-]+)\.json$/)?.[1];
const rawDir = `raw/${sourceId}`;
const groundDir = `ground/${sourceId}`;
if (sourceId && sourceId !== 'web-search' && existsSync(groundDir)) {
  const rawText = [groundDir, rawDir].filter(existsSync).flatMap((d) => readdirSync(d).map((f) => readFileSync(`${d}/${f}`, 'utf8'))).join('\n');
  const feed = existsSync(`${groundDir}/events.json`) ? JSON.parse(readFileSync(`${groundDir}/events.json`, 'utf8')) : null;
  const norm = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
  events.forEach((e, i) => {
    const at = `[${i}] ${e?.title ?? 'untitled'}`;
    for (const f of ['url', 'registerUrl']) {
      if (e[f] && !rawText.includes(e[f].replace(/\/+$/, ''))) {
        problems.push(`${at}: ${f} ${e[f]} does not appear in ${rawDir}/ — copy links exactly from the source, never build them`);
      }
    }
    if (feed) {
      const sameUrl = feed.filter((r) => r.url === e.url);
      // Recurring events share a url; prefer the same-day occurrence with the same start time.
      const sameDay = sameUrl.filter((r) => r.date === e.date);
      const match = sameDay.find((r) => (r.startTime ?? '') === (e.startTime ?? '')) ?? sameDay[0];
      if (!sameUrl.length) return; // already reported as a url problem
      if (!match) problems.push(`${at}: the feed has this event on ${sameUrl.map((r) => r.date).join(', ')}, not ${e.date}`);
      else {
        if (norm(match.title) !== norm(e.title)) problems.push(`${at}: title must match the feed exactly: "${match.title}"`);
        if ((match.startTime ?? '') !== (e.startTime ?? '')) problems.push(`${at}: startTime must match the feed: ${match.startTime ?? '(none; omit it)'}`);
        if ((match.endTime ?? '') !== (e.endTime ?? '') && e.endTime !== undefined) problems.push(`${at}: endTime must match the feed: ${match.endTime ?? '(none; omit it)'}`);
      }
    }
  });
}

// A registry source's note must start with its status line; scout reads it.
if (sourceId && sourceId !== 'web-search') {
  const note = `notes/sources/${sourceId}.md`;
  const first = existsSync(note) ? readFileSync(note, 'utf8').split('\n')[0].trim() : null;
  if (first === null) problems.push(`${note} is missing; write it (first line: status: ok, status: thin or status: broken)`);
  else if (!/^status: (ok|thin|broken)$/.test(first)) problems.push(`${note}: the first line must be exactly "status: ok", "status: thin" or "status: broken", not "${first.slice(0, 60)}"`);
}

if (problems.length) {
  console.error(`${file} has ${problems.length} problem(s):\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log(`${file} OK: ${events.length} events.`);
