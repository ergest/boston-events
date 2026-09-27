// Joins a source's batch files events/parts/<id>-N.json (N = 1, 2, …) into events/<id>.json.
//   node join.mjs <id>
// Agents write events in small batches because local servers such as Unsloth Studio don't stream
// tool calls: one big Write is minutes of silence that idle timeouts mistake for a hang.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const id = process.argv[2];
if (!/^[a-z0-9-]+$/.test(id ?? '')) {
  console.error('usage: node join.mjs <source-id>');
  process.exit(1);
}
mkdirSync('events/parts', { recursive: true });
const parts = readdirSync('events/parts')
  .map((f) => f.match(new RegExp(`^${id}-(\\d+)\\.json$`)))
  .filter(Boolean)
  .sort((a, b) => a[1] - b[1]);

const events = [];
const problems = [];
for (const [f] of parts) {
  try {
    const list = JSON.parse(readFileSync(`events/parts/${f}`, 'utf8'));
    if (!Array.isArray(list)) throw new Error('must be a JSON array');
    if (list.length > 10) problems.push(`${f}: ${list.length} events; keep each part to at most 10`);
    events.push(...list);
  } catch (err) {
    problems.push(`${f}: ${err.message}`);
  }
}
if (problems.length) {
  console.error('Fix these part files, then rerun join:\n- ' + problems.join('\n- '));
  process.exit(1);
}
// `source` is the registry name for every record; set it here rather than trust each batch.
const registry = existsSync('sources.json') ? JSON.parse(readFileSync('sources.json', 'utf8')).sources.find((s) => s.id === id) : null;
if (registry) for (const e of events) if (e && typeof e === 'object') e.source = registry.name;
if (!parts.length && existsSync(`events/${id}.json`)) {
  console.log(`No parts for ${id}; left events/${id}.json as is.`);
  process.exit(0);
}
writeFileSync(`events/${id}.json`, JSON.stringify(events, null, 2) + '\n');
console.log(`events/${id}.json: ${events.length} events from ${parts.length} part(s).`);
