// Fetches one registry source for its codon's agent. Full copies go to ground/<id>/ (used by
// check.mjs and fetch-detail.mjs for grounding); the agent gets small chunks from chunks/<id>/,
// one at a time through chunk.mjs, so its context stays small on a local model:
//   ics  → chunks/<id>/events-N.json (at most CHUNK_EVENTS parsed VEVENTs inside the window)
//   page → chunks/<id>/page-N.md     (Firecrawl markdown, split into ~CHUNK_CHARS pieces)
//   json → both: Firecrawl-extracted events-N.json plus the page as page-N.md
// Also writes current-source.json. Never exits nonzero: a failed fetch is recorded in
// raw/<id>/FETCH_ERROR.txt so the agent can report the source as broken.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { firecrawl } from './firecrawl.mjs';
import { trimPage } from './pagetrim.mjs';

const CHUNK_CHARS = 12000;
const CHUNK_EVENTS = 10;
const DESCRIPTION_CHARS = 200;

const id = process.argv[2];
const { sources } = JSON.parse(readFileSync('sources.json', 'utf8'));
const window = JSON.parse(readFileSync('window.json', 'utf8'));
const source = sources.find((s) => s.id === id);
if (!source) {
  console.error(`No source with id "${id}" in sources.json`);
  process.exit(1);
}

const dir = `raw/${id}`;
const ground = `ground/${id}`;
const chunks = `chunks/${id}`;
for (const d of [dir, ground, chunks]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}
rmSync(`raw/${id}.excluded.json`, { force: true });
mkdirSync('events', { recursive: true });
mkdirSync('notes/sources', { recursive: true });
writeFileSync('current-source.json', JSON.stringify(source, null, 2) + '\n');

const errors = [];
const events = [];
const pages = [];
const shorten = (s) => (s && s.length > DESCRIPTION_CHARS ? s.slice(0, DESCRIPTION_CHARS) + '…' : s);

if (source.fetch === 'ics') {
  for (const url of source.urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const inWindow = parseIcs(await res.text()).filter((e) => e.date >= window.start && e.date <= window.end);
      const { kept, excluded } = applyExclude(inWindow, source.exclude);
      const runs = collapseRuns(kept);
      events.push(...runs);
      // Excluded items go next to raw/<id>/, not inside it, so the agent never sees them as source data.
      if (excluded.length) writeFileSync(`raw/${id}.excluded.json`, JSON.stringify(excluded, null, 2) + '\n');
      console.log(`${id}: ${inWindow.length} feed events in window from ${url}; ${excluded.length} pre-filtered out, ${kept.length} kept${runs.length < kept.length ? `, ${runs.length} after collapsing multi-day runs` : ''}`);
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }
} else if (source.fetch === 'page') {
  for (const url of source.urls) {
    const r = firecrawl(['scrape', url, '--only-main-content', '--max-age', '3600000'], 180000);
    if (r.status !== 0) errors.push(`${url}: firecrawl exited ${r.status ?? r.signal}: ${(r.stderr || r.error?.message || '').trim().slice(0, 500)}`);
    else {
      const page = trimPage(r.stdout);
      pages.push(`<!-- ${url} -->\n` + page);
      console.log(`${id}: scraped ${url} (${r.stdout.length} → ${page.length} chars)`);
    }
  }
} else if (source.fetch === 'json') {
  // Firecrawl extracts records with events.schema.json (5 credits/page, markdown included free).
  // Records whose url isn't on the page are dropped, so extraction can't invent links; the
  // trimmed markdown is kept so the agent can add listings the extraction missed.
  let dropped = 0;
  for (const url of source.urls) {
    const r = firecrawl(['scrape', url, '--format', 'json,markdown', '--schema-file', 'events.schema.json', '--max-age', '3600000'], 240000);
    let data;
    try {
      if (r.status !== 0) throw new Error(`firecrawl exited ${r.status ?? r.signal}: ${(r.stderr || '').trim().slice(0, 300)}`);
      data = JSON.parse(r.stdout);
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
      continue;
    }
    const md = data.markdown ?? '';
    pages.push(`<!-- ${url} -->\n` + trimPage(md));
    const hhmm = (t) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t ?? '') ? t : undefined);
    for (const e of data.json?.events ?? []) {
      if (!e.url || !md.includes(e.url.replace(/\/+$/, ''))) { dropped++; continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '') || e.date < window.start || e.date > window.end) continue;
      const clean = Object.fromEntries(Object.entries({
        title: e.title, date: e.date, startTime: hhmm(e.startTime), endTime: hhmm(e.startTime) && hhmm(e.endTime),
        venue: e.venue, address: e.address, price: e.price, url: e.url, registerUrl: e.registerUrl, description: e.description,
      }).filter(([, v]) => typeof v === 'string' && v.trim()));
      if (clean.registerUrl && !md.includes(clean.registerUrl.replace(/\/+$/, ''))) delete clean.registerUrl;
      events.push(clean);
    }
    console.log(`${id}: extracted ${url} (${data.json?.events?.length ?? 0} records, ${dropped} dropped for links not on the page)`);
  }
} else {
  errors.push(`unknown fetch method "${source.fetch}"`);
}

// Full copies for grounding, then the agent's chunks.
if (source.fetch !== 'page') {
  writeFileSync(`${ground}/events.json`, JSON.stringify(events, null, 2) + '\n');
  const short = events.map((e) => ({ ...e, description: shorten(e.description) }));
  for (let i = 0; i < short.length; i += CHUNK_EVENTS) {
    writeFileSync(`${chunks}/events-${i / CHUNK_EVENTS + 1}.json`, JSON.stringify(short.slice(i, i + CHUNK_EVENTS), null, 2) + '\n');
  }
}
if (pages.length) {
  const all = pages.join('\n\n');
  writeFileSync(`${ground}/pages.md`, all);
  chunkText(all).forEach((c, i) => writeFileSync(`${chunks}/page-${i + 1}.md`, c));
}
const chunkCount = (source.fetch !== 'page' ? Math.ceil(events.length / CHUNK_EVENTS) : 0) + (pages.length ? chunkText(pages.join('\n\n')).length : 0);
console.log(`${id}: ${events.length} events, ${chunkCount} chunk(s) in ${chunks}/`);

if (errors.length) {
  writeFileSync(`${dir}/FETCH_ERROR.txt`, errors.join('\n') + '\n');
  console.log(`${id}: fetch problems recorded in ${dir}/FETCH_ERROR.txt`);
}

// Splits markdown at blank lines into pieces of at most CHUNK_CHARS (a single longer block is cut hard).
function chunkText(text) {
  const chunks = [];
  let cur = '';
  for (const block of text.split(/\n{2,}/)) {
    if (cur && cur.length + block.length + 2 > CHUNK_CHARS) {
      chunks.push(cur);
      cur = '';
    }
    cur = cur ? cur + '\n\n' + block : block;
    while (cur.length > CHUNK_CHARS) {
      const cut = cur.lastIndexOf('\n', CHUNK_CHARS) > 0 ? cur.lastIndexOf('\n', CHUNK_CHARS) : CHUNK_CHARS;
      chunks.push(cur.slice(0, cut));
      cur = cur.slice(cut).replace(/^\n+/, '');
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

// --- pre-filter for large feeds ---------------------------------------------------------
// source.exclude = { requireLocation?: bool, categories?: [substring], titles?: [regex, case-insensitive] }
function applyExclude(events, rules) {
  if (!rules) return { kept: events, excluded: [] };
  const titleRes = (rules.titles ?? []).map((p) => new RegExp(p, 'i'));
  const kept = [];
  const excluded = [];
  for (const e of events) {
    let reason = null;
    if (rules.requireLocation && !e.location) reason = 'no location';
    else if ((rules.categories ?? []).some((c) => (e.feedCategories ?? '').includes(c))) reason = 'category';
    else if (titleRes.some((re) => re.test(e.title))) reason = 'title';
    if (reason) excluded.push({ reason, title: e.title, date: e.date });
    else kept.push(e);
  }
  return { kept, excluded };
}

// --- minimal ICS parsing -------------------------------------------------------------

function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur) events.push(toRecord(cur));
      cur = null;
    } else if (cur) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (m && !(m[1] in cur)) cur[m[1]] = { params: m[2], value: m[3] };
    }
  }
  return events.filter((e) => e.date);
}

// An exhibition or daily program appears in a feed once per day. The same title, link and start
// time on 3+ dates becomes one record on its first date, with endDate set to its last date.
function collapseRuns(list) {
  const groups = new Map();
  for (const e of list) {
    const key = [e.title, e.url ?? '', e.startTime ?? ''].join('|');
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 3) out.push(...g);
    else {
      const dates = g.map((e) => e.date).sort();
      out.push({ ...g.find((e) => e.date === dates[0]), endDate: dates.at(-1) });
    }
  }
  return out.sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
}

// Also decodes HTML that some feeds (e.g. Trumba) put in text fields: entities and <br> line breaks.
function unescape(s = '') {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(quot|amp|lt|gt|nbsp|apos);/g, (_, e) => ({ quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'" })[e])
    .replace(/(, )+/g, ', ')
    .replace(/^, |, $/g, '')
    .trim();
}

// Returns { date: 'YYYY-MM-DD', time?: 'HH:MM' } in Boston local time.
function toLocal(prop) {
  if (!prop) return {};
  const v = prop.value;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return {};
  const [, y, mo, d, h, mi, , z] = m;
  if (!h) return { date: `${y}-${mo}-${d}` };
  if (!z) return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` }; // floating or TZID; this region's feeds use Eastern
  const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(utc).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function toRecord(ev) {
  const start = toLocal(ev.DTSTART);
  const end = toLocal(ev.DTEND);
  // Some feeds (e.g. Localist) encode all-day events as 05:00Z = 1am Eastern. Treat pre-2am starts as "no time".
  if (start.time && start.time < '02:00') start.time = end.time = undefined;
  const rec = {
    title: unescape(ev.SUMMARY?.value),
    date: start.date,
    startTime: start.time,
    endTime: end.date === start.date ? end.time : undefined,
    location: unescape(ev.LOCATION?.value) || undefined,
    // Some feeds (e.g. Luma) have no URL property; the event link is the first link in DESCRIPTION.
    url: ev.URL?.value || unescape(ev.DESCRIPTION?.value).match(/https?:\/\/[^\s<>"]+/)?.[0] || undefined,
    description: unescape(ev.DESCRIPTION?.value).slice(0, 400) || undefined,
    feedCategories: unescape(ev.CATEGORIES?.value) || undefined,
  };
  return JSON.parse(JSON.stringify(rec)); // drop undefined fields
}
