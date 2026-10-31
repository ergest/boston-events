// Fetches one registry source for its codon's agent. Full copies go to ground/<id>/ (used by
// check.mjs and fetch-detail.mjs for grounding); the agent gets small chunks from chunks/<id>/,
// one at a time through chunk.mjs, so its context stays small on a local model:
//   ics  → chunks/<id>/events-N.json (at most CHUNK_EVENTS parsed VEVENTs inside the window)
//   page → chunks/<id>/page-N.md     (page markdown from page.mjs, split into ~CHUNK_CHARS pieces)
// Also writes current-source.json. Never exits nonzero: a failed fetch is recorded in
// raw/<id>/FETCH_ERROR.txt so the agent can report the source as broken.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { expandUrl, fetchPage } from './page.mjs';

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
  for (const url of source.urls.map((u) => expandUrl(u, window))) {
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
} else if (source.fetch === 'dostuff' || source.fetch === 'eventbrite') {
  // Sites with one listing per day, paged, whose pages carry structured data (DoStuff microdata on Do617, __SERVER_DATA__ JSON on Eventbrite):
  // a script parses them and the agent only triages.
  const base = new URL(source.urls[0]).origin;
  const eb = source.fetch === 'eventbrite';
  const listUrl = (day, page) => {
    const [y, m, dd] = day.split('-').map(Number);
    return eb ? `${source.urls[0].replace(/\/?(\?.*)?$/, '')}--${day}/?page=${page}` : `${base}/events/${y}/${m}/${dd}?page=${page}`;
  };
  const parse = eb ? parseEventbrite : parseDoStuff;
  // Pages per day: Eventbrite ranks by relevance and lists ~1000 a day, so near days take maxPages and far days farMaxPages.
  const nearDate = new Date(`${window.start}T12:00:00Z`);
  nearDate.setUTCDate(nearDate.getUTCDate() + (source.nearDays ?? 9999));
  const nearBy = nearDate.toISOString().slice(0, 10);
  const pagesFor = (day) => (day > nearBy ? (source.farMaxPages ?? source.maxPages ?? 12) : (source.maxPages ?? 12));
  // source.days = [first, last] day offsets from the window start: one source per slice keeps each agent's context small.
  const [firstDay, lastDay] = source.days ?? [0, 9999];
  const days = [];
  for (let i = 0, d = new Date(`${window.start}T12:00:00Z`); d.toISOString().slice(0, 10) <= window.end; i++, d.setUTCDate(d.getUTCDate() + 1)) if (i >= firstDay && i <= lastDay) days.push(d.toISOString().slice(0, 10));
  const seen = new Set();
  const found = [];
  const fetchDay = async (day) => {
    let count = 0;
    for (let page = 1; page <= pagesFor(day); page++) {
      const url = listUrl(day, page);
      if (eb) await new Promise((r) => setTimeout(r, 1000));
      let html;
      for (let attempt = 1; !html; attempt++) {
        try {
          const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(60000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          html = await res.text();
        } catch (err) {
          if (attempt < (eb ? 7 : 4)) await new Promise((r) => setTimeout(r, (eb ? 4000 : 1500) * attempt));
          else {
            errors.push(`${url}: ${err.message}`);
            break;
          }
        }
      }
      if (!html) break;
      const cards = parse(html, base).filter((e) => !seen.has(e.url + e.date));
      if (!cards.length) break;
      for (const e of cards) seen.add(e.url + e.date);
      found.push(...cards);
      count += cards.length;
    }
    return count;
  };
  const lanes = eb ? 1 : 5; // Eventbrite answers 429 under heavier load
  for (let i = 0; i < days.length; i += lanes) await Promise.all(days.slice(i, i + lanes).map(fetchDay));
  // Cards name their city; drop other known cities (Boston neighborhoods count as Boston) but keep cards with no city.
  const hoods = ['Allston', 'Back Bay', 'Brighton', 'Charlestown', 'Chinatown', 'Dorchester', 'East Boston', 'Fenway', 'Hyde Park', 'Jamaica Plain', 'Mattapan', 'Mission Hill', 'Roslindale', 'Roxbury', 'South Boston', 'South End', 'West Roxbury'];
  const wanted = new Set([...window.cities, ...hoods].map((c) => c.toLowerCase()));
  const cityOf = (e) => e.location?.split(', ').at(-2);
  const inWindow = found.filter((e) => e.date >= window.start && e.date <= window.end && (!source.cityFilter || !/MA$/.test(e.location ?? '') || wanted.has(cityOf(e)?.toLowerCase()) || !cityOf(e) || cityOf(e) === e.location?.split(', ')[0]));
  const { kept: pre, excluded } = applyExclude(inWindow, source.exclude);
  // Far-out days only keep popular events (the ones that sell out); weekly runs re-cover the near days in full.
  const nearEnd = new Date(`${window.start}T12:00:00Z`);
  nearEnd.setUTCDate(nearEnd.getUTCDate() + (source.nearDays ?? 9999));
  const nearLimit = nearEnd.toISOString().slice(0, 10);
  // Without attendee counts on the cards (Do617's redesign dropped them), far days are limited by farMaxPages instead.
  const hasCounts = found.some((e) => e.attendees !== undefined);
  const kept = pre.filter((e) => {
    const far = e.date > nearLimit && source.farMinAttendees && hasCounts && (e.attendees ?? 0) < source.farMinAttendees;
    if (far) excluded.push({ reason: 'far and unpopular', title: e.title, date: e.date });
    return !far;
  });
  const runs = collapseRuns(kept, (e) => [e.title, e.location ?? '', e.startTime ?? ''].join('|')).map(({ attendees, ...e }) => e);
  events.push(...runs);
  if (excluded.length) writeFileSync(`raw/${id}.excluded.json`, JSON.stringify(excluded, null, 2) + '\n');
  console.log(`${id}: ${found.length} listing cards over ${days.length} days; ${inWindow.length} in window, ${excluded.length} pre-filtered out, ${runs.length} after collapsing runs`);
} else if (source.fetch === 'page') {
  // curl first, then a headless local browser for pages that need JavaScript (page.mjs); no paid service.
  for (const url of source.urls.map((u) => expandUrl(u, window))) {
    const r = fetchPage(url, { trimParagraphs: source.trimParagraphs });
    if (!r.markdown) errors.push(`${url}: ${r.error || 'no text'}`);
    else {
      pages.push(`<!-- ${url} -->\n` + r.markdown);
      console.log(`${id}: fetched ${url} with ${r.how} (${r.markdown.length} chars)${r.error ? `; ${r.error}` : ''}`);
    }
  }
} else {
  errors.push(`unknown fetch method "${source.fetch}" (use "ics", "dostuff", "eventbrite" or "page")`);
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

// --- DoStuff listing parsing ---------------------------------------------------------------

// Do617 is a SvelteKit app: each day page embeds its listing as a JS object literal (not JSON) in
// kit.start(..., { data: [...] }), under browse.data[].events. Cards carry title, permalink, local start
// time, category and venue name/area, but no street, city, price or attendee count.
// Turns that literal into JSON by quoting bare keys and mapping `void 0` to null, never evaluating it.
function jsLiteralToJson(src) {
  let out = '';
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (/[A-Za-z_$]/.test(c)) {
      const word = src.slice(i).match(/^[A-Za-z_$][\w$]*/)[0];
      i += word.length;
      if (src[i] === ':') out += `"${word}"`;
      else if (word === 'void' && src.startsWith(' 0', i)) (out += 'null'), (i += 2);
      else if (['true', 'false', 'null'].includes(word)) out += word;
      else if (word === 'undefined' || word === 'NaN') out += 'null';
      else throw new Error(`unexpected token ${word}`);
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// Keeps Massachusetts cards only (the listing mixes in NH, RI and online events).
function parseDoStuff(html, base) {
  const start = html.search(/\bdata:\s*\[\{type:"data"/);
  if (start < 0) return [];
  const open = html.indexOf('[', start);
  let depth = 0, i = open, inString = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') if (--depth === 0) break;
  }
  let nodes;
  try {
    nodes = JSON.parse(jsLiteralToJson(html.slice(open, i + 1)));
  } catch {
    return [];
  }
  const out = [];
  for (const day of nodes.flatMap((n) => n?.data?.browse?.data ?? [])) {
    for (const ev of day.events ?? []) {
      const begin = ev.tz_adjusted_begin_time ?? '';
      const date = ev.occurrence_date ?? day.date ?? begin.slice(0, 10);
      if (!ev.title || !ev.permalink || !date) continue;
      const rec = {
        title: unescape(ev.title),
        date,
        startTime: /T\d{2}:\d{2}/.test(begin) && !/T00:00:00/.test(begin) ? begin.slice(11, 16) : undefined,
        endTime: ev.tz_adjusted_end_time ? ev.tz_adjusted_end_time.slice(11, 16) : undefined,
        location: [ev.venue?.title, ev.venue?.area_name].filter(Boolean).join(', ') || undefined,
        url: base + ev.permalink,
        description: ev.event_type === 'multi_day' && ev.date_label ? `Runs ${ev.date_label.split('|')[0].trim()}` : ev.event_type === 'weekly_repeating' ? 'Weekly' : undefined,
        feedCategories: ev.category ? ev.category.toLowerCase().replace(/[^a-z]+/g, '-') : undefined,
      };
      out.push(JSON.parse(JSON.stringify(rec)));
    }
  }
  return out;
}

// Eventbrite search pages embed their results as JSON. Keeps Massachusetts, in-person, not cancelled.
function parseEventbrite(html) {
  const raw = html.match(/window\.__SERVER_DATA__\s*=\s*(\{.*?\});\s*\n/s)?.[1];
  if (!raw) return [];
  let results;
  try {
    results = JSON.parse(raw).search_data?.events?.results ?? [];
  } catch {
    return [];
  }
  const out = [];
  for (const r of results) {
    const a = r.primary_venue?.address ?? {};
    if (!r.name || !r.start_date || !r.url || r.is_online_event || r.is_cancelled || (a.region && a.region !== 'MA')) continue;
    const rec = {
      title: unescape(r.name),
      date: r.start_date,
      endDate: r.end_date && r.end_date > r.start_date ? r.end_date : undefined,
      startTime: r.start_time || undefined,
      endTime: r.end_date === r.start_date ? r.end_time || undefined : undefined,
      location: [r.primary_venue?.name, a.address_1, a.city, a.region].filter(Boolean).join(', ') || undefined,
      url: r.url.replace(/^https?:\/\/(www\.)?eventbrite\.[a-z.]+/, 'https://www.eventbrite.com').split('?')[0],
      description: unescape(r.summary ?? '').slice(0, 400) || undefined,
    };
    out.push(JSON.parse(JSON.stringify(rec)));
  }
  return out;
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
function collapseRuns(list, keyOf = (e) => [e.title, e.url ?? '', e.startTime ?? ''].join('|')) {
  const groups = new Map();
  for (const e of list) {
    const key = keyOf(e);
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
