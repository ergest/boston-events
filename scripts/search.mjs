// Hands the web-search agent one query at a time, runs the search itself, and caps what it costs:
//   node search.mjs               prints the next query's results (after the current one is answered)
//   node search.mjs --none        the current query found nothing new; prints the next one
//   node search.mjs --open <url>  prints a page from the current results (page.mjs: curl, then a local browser)
// It refuses to move on until a new events/parts/web-search-N.json exists (or --none is given),
// and writes notes/web-search.md as it goes.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { firecrawl } from './firecrawl.mjs';
import { fetchPage } from './page.mjs';

const MAX_QUERIES = 10;
const RESULTS_PER_QUERY = 6;
const OPENS_PER_QUERY = 3;
const PAGE_CHARS = 4000;

const [flag, arg] = process.argv.slice(2);
if (flag && !['--none', '--open'].includes(flag)) {
  console.error('usage: node search.mjs [--none | --open <url>]');
  process.exit(1);
}
mkdirSync('search', { recursive: true });
const stateFile = 'search/.state.json';
const state = existsSync(stateFile)
  ? JSON.parse(readFileSync(stateFile, 'utf8'))
  : { queries: buildQueries(), served: 0, parts: 0, opens: 0, log: [] };
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
const parts = existsSync('events/parts') ? readdirSync('events/parts').filter((f) => /^web-search-\d+\.json$/.test(f)).length : 0;

if (flag === '--open') {
  if (!state.served) fail('Run node search.mjs first to get a query.');
  const results = readFileSync(`search/results-${state.served}.txt`, 'utf8');
  if (!/^https?:\/\//.test(arg ?? '') || !results.includes(arg)) fail(`Refused: only open URLs listed in the current results (search/results-${state.served}.txt), copied exactly.`);
  if (state.opens >= OPENS_PER_QUERY) fail(`Refused: already opened ${OPENS_PER_QUERY} pages for this query. Save what you have, then move on.`);
  state.opens++;
  save();
  console.log(page(arg));
  process.exit(0);
}

// Move on only once the current query is answered.
if (state.served > 0) {
  const answered = parts > state.parts || flag === '--none';
  if (!answered) fail(`Not yet: save the new events from query ${state.served} to events/parts/web-search-${parts + 1}.json (at most 10), or run node search.mjs --none if it found nothing new. Then run node search.mjs again.`);
  state.log[state.served - 1].events = parts > state.parts ? count(`events/parts/web-search-${parts}.json`) : 0;
}
if (state.served >= state.queries.length) {
  state.parts = parts;
  save();
  writeNotes();
  console.log(`All ${state.queries.length} queries done. Now run: node join.mjs web-search`);
  process.exit(0);
}

const q = state.queries[state.served];
const r = firecrawl(['search', q, '--limit', String(RESULTS_PER_QUERY), '--sources', 'web'], 90000);
const text = r.status === 0 ? r.stdout.trim().slice(0, 6000) : `(search failed: ${(r.stderr || '').trim().slice(0, 200)})`;
state.served++;
state.parts = parts;
state.opens = 0;
state.log.push({ query: q, events: 0 });
writeFileSync(`search/results-${state.served}.txt`, text + '\n');
save();
writeNotes();
console.log(`=== query ${state.served} of ${state.queries.length}: ${q} ===`);
console.log(text);
console.log(`=== end of results. Open up to ${OPENS_PER_QUERY} promising pages with node search.mjs --open <url>. Check each candidate with node known.mjs "<title>". Save new events to events/parts/web-search-${parts + 1}.json (or run node search.mjs --none), then run node search.mjs ===`);

// Cities with the fewest known events first; then region-wide queries for one-off events.
function buildQueries() {
  const window = JSON.parse(readFileSync('window.json', 'utf8'));
  const known = {};
  for (const f of existsSync('events') ? readdirSync('events').filter((f) => f.endsWith('.json') && f !== 'web-search.json') : []) {
    try {
      for (const e of JSON.parse(readFileSync(`events/${f}`, 'utf8'))) known[e.city] = (known[e.city] ?? 0) + 1;
    } catch {
      // merge.mjs reports malformed files.
    }
  }
  const month = new Date(`${window.start}T12:00:00`).toLocaleString('en-US', { month: 'long' });
  const endMonth = new Date(`${window.end}T12:00:00`).toLocaleString('en-US', { month: 'long' });
  const months = month === endMonth ? month : `${month} ${endMonth}`;
  const year = window.start.slice(0, 4);
  const cities = [...window.cities].filter((c) => c !== 'Boston').sort((a, b) => (known[a] ?? 0) - (known[b] ?? 0));
  const regional = [`Boston street fair festival ${months} ${year}`, `Greater Boston fall festivals ${months} ${year}`, `Boston free outdoor events ${months} ${year}`];
  return [...cities.slice(0, MAX_QUERIES - regional.length).map((c) => `${c} MA events ${months} ${year}`), ...regional];
}

function page(url) {
  const r = fetchPage(url);
  if (!r.markdown) return `--- ${url} (${r.error || 'no text'}) ---\n(no page text; skip this page)`;
  return `--- ${url} (${r.how}), ${Math.min(PAGE_CHARS, r.markdown.length)} of ${r.markdown.length} chars ---\n${r.markdown.slice(0, PAGE_CHARS)}`;
}

function count(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8')).length;
  } catch {
    return 0;
  }
}

function writeNotes() {
  mkdirSync('notes', { recursive: true });
  // Sites that produced events, for the scout step to consider as registry sources.
  const sites = {};
  for (const f of existsSync('events/parts') ? readdirSync('events/parts').filter((f) => /^web-search-\d+\.json$/.test(f)) : []) {
    try {
      for (const e of JSON.parse(readFileSync(`events/parts/${f}`, 'utf8'))) {
        const host = new URL(e.url).hostname.replace(/^www\./, '');
        sites[host] = (sites[host] ?? 0) + 1;
      }
    } catch {
      // check.mjs reports malformed parts.
    }
  }
  const lines = [
    '# Web search',
    '',
    `Queries run: ${state.served} of ${state.queries.length} (Firecrawl search, about 1 credit each).`,
    '',
    ...state.log.map((l) => `- ${l.query}: ${l.events} new event(s)`),
    '',
    '## Sites that produced events',
    '',
    ...Object.entries(sites).sort((a, b) => b[1] - a[1]).map(([h, n]) => `- ${h}: ${n}`),
  ];
  writeFileSync('notes/web-search.md', lines.join('\n') + '\n');
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
