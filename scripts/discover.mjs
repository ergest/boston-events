// Finds new event sites for the registry, one search at a time, for the discover codon's agent:
//   node discover.mjs                        runs the next search and prints its results
//   node discover.mjs --check <url>          fetches a result (free, page.mjs) and reports whether it
//                                            lists dated events in the window and has a calendar feed
//   node discover.mjs --keep <url> "<name>" "<why>"   records a checked site as a candidate
//   node discover.mjs --none                 the current search found no candidate
// It refuses the next search until the current one has a --keep or --none, skips sites already in
// the registry, and writes notes/candidate-sources.md as it goes. Firecrawl is used only to search.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { firecrawl } from './firecrawl.mjs';
import { fetchPage } from './page.mjs';

const MAX_QUERIES = 8;
const RESULTS_PER_QUERY = 8;
const CHECKS_PER_QUERY = 3;
const PAGE_CHARS = 2500;

const [flag, arg, name, why] = process.argv.slice(2);
if (flag && !['--check', '--keep', '--none'].includes(flag)) fail('usage: node discover.mjs [--check <url> | --keep <url> "<name>" "<why>" | --none]');
const window = JSON.parse(readFileSync('window.json', 'utf8'));
const { sources } = JSON.parse(readFileSync('sources.json', 'utf8'));
const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const registryHosts = new Set(sources.flatMap((s) => s.urls).map(hostOf));

mkdirSync('discover', { recursive: true });
const stateFile = 'discover/.state.json';
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { queries: buildQueries(), served: 0, answered: true, checks: 0, results: [], checked: {}, kept: [] };
const save = () => {
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
  writeNotes();
};

if (flag === '--check') {
  if (!state.served) fail('Run node discover.mjs first.');
  const known = state.results.includes(arg) || Object.values(state.checked).some((c) => c.links?.includes(arg));
  if (!known) fail('Refused: only check URLs from the current results, or links found on a page you checked, copied exactly.');
  if (registryHosts.has(hostOf(arg))) fail(`Refused: ${hostOf(arg)} is already in the registry.`);
  if (state.checks >= CHECKS_PER_QUERY) fail(`Refused: already checked ${CHECKS_PER_QUERY} pages for this search. Keep one with --keep, or run --none.`);
  state.checks++;
  const r = fetchPage(arg);
  const text = r.markdown;
  const plain = text.replace(/\]\([^)]*\)/g, ']');
  const days = windowDays();
  const datesInWindow = days.filter((d) => d.patterns.some((p) => p.test(plain))).length;
  const links = [...new Set([...text.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]))];
  const feeds = links.filter((l) => /\.ics\b|webcal|ical|trumba\.com|libcal\.com|localist|\/feed\b|rss/i.test(l)).slice(0, 5);
  const eventLinks = links.filter((l) => /event|calendar/i.test(l) && hostOf(l) === hostOf(arg)).slice(0, 8);
  state.checked[arg] = { query: state.queries[state.served - 1], how: r.how, error: r.error, chars: text.length, datesInWindow, feeds, links: [...eventLinks, ...feeds] };
  save();
  console.log(`--- ${arg} (${r.how || r.error}) ---`);
  console.log(`Days of the window this page lists: ${datesInWindow} of ${days.length}. Calendar feeds linked: ${feeds.length ? feeds.join(' ') : 'none'}.`);
  if (eventLinks.length) console.log(`Event or calendar links on this site (you may check one of these next): ${eventLinks.join(' ')}`);
  console.log(text ? text.slice(0, PAGE_CHARS) + (text.length > PAGE_CHARS ? '\n[…]' : '') : '(no page text)');
  process.exit(0);
}

if (flag === '--keep') {
  const c = state.checked[arg];
  if (!c) fail('Refused: --check the URL first, then keep it.');
  if (!name || !why) fail('usage: node discover.mjs --keep <url> "<site name>" "<why it is worth adding>"');
  state.kept.push({ url: arg, name, why, ...c, links: undefined });
  state.answered = true;
  save();
  console.log(`Kept ${name}. Run node discover.mjs for the next search, or --check/--keep another site from this one.`);
  process.exit(0);
}

if (flag === '--none') {
  state.answered = true;
  save();
}

if (state.served > 0 && !state.answered) fail(`Not yet: decide on search ${state.served} first. Keep a site with node discover.mjs --keep <url> "<name>" "<why>", or run node discover.mjs --none.`);
if (state.served >= state.queries.length) {
  save();
  console.log(`All ${state.queries.length} searches done; ${state.kept.length} candidate site(s) are in notes/candidate-sources.md. You are finished.`);
  process.exit(0);
}

const q = state.queries[state.served];
const r = firecrawl(['search', q, '--limit', String(RESULTS_PER_QUERY), '--sources', 'web'], 90000);
const out = r.status === 0 ? r.stdout : '';
// Drop results from sites already in the registry, and ones already checked.
const blocks = out.split(/\n(?=\S)/).filter((b) => {
  const u = b.match(/URL: (\S+)/)?.[1];
  return u && !registryHosts.has(hostOf(u)) && !state.checked[u];
});
state.served++;
state.answered = false;
state.checks = 0;
state.results = blocks.map((b) => b.match(/URL: (\S+)/)[1]);
save();
console.log(`=== search ${state.served} of ${state.queries.length}: ${q} ===`);
console.log(r.status === 0 ? (blocks.length ? blocks.join('\n').slice(0, 5000) : '(every result is already in the registry)') : `(search failed: ${(r.stderr || '').trim().slice(0, 200)})`);
console.log(`=== Pick results that look like a site's own events calendar (a town, library, venue, arts group), not one-off event pages or big aggregators. Check up to ${CHECKS_PER_QUERY} with node discover.mjs --check <url>, then --keep the good ones or run --none. ===`);

// Thinnest cities first, then thin categories and a couple of region-wide searches.
function buildQueries() {
  const perCity = {};
  const perCategory = {};
  for (const f of existsSync('events') ? readdirSync('events').filter((f) => f.endsWith('.json')) : []) {
    try {
      for (const e of JSON.parse(readFileSync(`events/${f}`, 'utf8'))) {
        perCity[e.city] = (perCity[e.city] ?? 0) + 1;
        perCategory[e.category] = (perCategory[e.category] ?? 0) + 1;
      }
    } catch {
      // merge.mjs reports malformed files.
    }
  }
  const cities = window.cities.filter((c) => c !== 'Boston').sort((a, b) => (perCity[a] ?? 0) - (perCity[b] ?? 0)).slice(0, 5);
  const categories = [...window.categories].sort((a, b) => (perCategory[a] ?? 0) - (perCategory[b] ?? 0)).slice(0, 2);
  return [
    ...cities.map((c) => `${c} MA community events calendar`),
    ...categories.map((c) => `Boston ${c} events calendar`),
    'Greater Boston neighborhood events calendar',
  ].slice(0, MAX_QUERIES);
}

function windowDays() {
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = [];
  for (let d = new Date(`${window.start}T12:00:00Z`); d.toISOString().slice(0, 10) <= window.end; d.setUTCDate(d.getUTCDate() + 1)) {
    const m = M[d.getUTCMonth()], n = d.getUTCDate(), iso = d.toISOString().slice(0, 10);
    days.push({ iso, patterns: [new RegExp(`\\b${m}\\.? ${n}\\b`, 'i'), new RegExp(`\\b${m.slice(0, 3)}\\.? ${n}\\b`, 'i'), new RegExp(`\\b${d.getUTCMonth() + 1}/${n}\\b`), new RegExp(iso)] });
  }
  return days;
}

function writeNotes() {
  mkdirSync('notes', { recursive: true });
  const kept = state.kept.map((k) => [
    `### ${k.name}`,
    '',
    `- URL: ${k.url}`,
    `- Why: ${k.why}`,
    `- Found by: "${k.query}"`,
    `- Lists ${k.datesInWindow} day(s) of the window; fetched with ${k.how}${k.feeds.length ? `; feeds: ${k.feeds.join(' ')}` : '; no feed link'}`,
    '',
  ].join('\n'));
  const rejected = Object.entries(state.checked).filter(([u]) => !state.kept.some((k) => k.url === u)).map(([u, c]) => `- ${u}: ${c.datesInWindow} day(s) of the window${c.error ? `, ${c.error}` : ''}`);
  writeFileSync('notes/candidate-sources.md', [
    '# Candidate sources',
    '',
    `Searches run: ${state.served} of ${state.queries.length}. Candidates kept: ${state.kept.length}.`,
    '',
    ...(kept.length ? kept : ['(none yet)', '']),
    '## Checked, not kept',
    '',
    ...(rejected.length ? rejected : ['(none)']),
    '',
  ].join('\n'));
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
