// Hands the spot-check agent one flagged event at a time, with its page already fetched, and
// applies each decision to events.json before serving the next, so a timeout loses no work:
//   node flag.mjs          applies spot/<n>.json for the current event, then prints the next one
// The agent answers each event by writing spot/<n>.json:
//   { "action": "keep" }  |  { "action": "fix", "set": { "startTime": "19:00", ... } }  |  { "action": "remove", "why": "..." }
// Pages are fetched by page.mjs: curl, then a headless local browser if needed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchPage } from './page.mjs';
import { recordKey, recordProblems } from './record.mjs';

const PAGE_CHARS = 4000;
const FIELDS = ['title', 'date', 'endDate', 'startTime', 'endTime', 'venue', 'address', 'city', 'price', 'url', 'registerUrl', 'description', 'category'];

const window = JSON.parse(readFileSync('window.json', 'utf8'));
const flagged = JSON.parse(readFileSync('flagged.json', 'utf8'));
// Dead or blocked links first, where removals happen; missing times last.
const rank = (f) => (f.reasons.some((r) => r.startsWith('url ')) ? 0 : f.reasons.some((r) => r.startsWith('possible duplicate')) ? 1 : 2);
const queue = [...flagged].sort((a, b) => rank(a) - rank(b));
mkdirSync('spot', { recursive: true });
const stateFile = 'spot/.state.json';
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { served: 0, kept: 0, fixed: 0, removed: [] };

// 1. Apply the answer for the event served last.
if (state.served > 0) {
  const answerFile = `spot/${state.served}.json`;
  if (!existsSync(answerFile)) {
    console.error(`Not yet: write your decision for event ${state.served} to ${answerFile} first ({"action":"keep"}, {"action":"fix","set":{...}} or {"action":"remove","why":"..."}), then run node flag.mjs again.`);
    process.exit(1);
  }
  let answer;
  try {
    answer = JSON.parse(readFileSync(answerFile, 'utf8'));
  } catch (err) {
    console.error(`${answerFile} is not valid JSON (${err.message}). Rewrite it, then run node flag.mjs again.`);
    process.exit(1);
  }
  const target = queue[state.served - 1];
  const events = JSON.parse(readFileSync('events.json', 'utf8'));
  const i = events.findIndex((e) => e.id === target.id);
  if (answer.action === 'remove') {
    if (i >= 0) events.splice(i, 1);
    state.removed.push(`${target.title} (${target.date}): ${answer.why || 'no reason given'}`);
  } else if (answer.action === 'fix') {
    const bad = Object.keys(answer.set ?? {}).filter((k) => !FIELDS.includes(k));
    if (!answer.set || bad.length) {
      console.error(`${answerFile}: "fix" needs a "set" object with only these fields: ${FIELDS.join(', ')}${bad.length ? ` (not ${bad.join(', ')})` : ''}. Rewrite it, then run node flag.mjs again.`);
      process.exit(1);
    }
    if (i >= 0) {
      const fixed = { ...events[i], ...answer.set };
      const problems = recordProblems(fixed, window);
      if (events.some((e, j) => j !== i && recordKey(e) === recordKey(fixed))) problems.push('it would duplicate another event (same title, date and city); remove this one instead');
      if (problems.length) {
        console.error(`${answerFile}: that fix would make the record invalid: ${problems.join('; ')}. Rewrite it, then run node flag.mjs again.`);
        process.exit(1);
      }
      events[i] = fixed;
    }
    state.fixed++;
  } else if (answer.action === 'keep') {
    state.kept++;
  } else {
    console.error(`${answerFile}: "action" must be "keep", "fix" or "remove". Rewrite it, then run node flag.mjs again.`);
    process.exit(1);
  }
  writeFileSync('events.json', JSON.stringify(events, null, 2) + '\n');
  writeFileSync(stateFile, JSON.stringify(state) + '\n');
  writeNotes();
}

// 2. Serve the next event.
if (state.served >= queue.length) {
  writeNotes();
  console.log(`All ${queue.length} flagged event(s) done; events.json and notes/spot-check.md are updated. Now run: node check.mjs`);
  process.exit(0);
}
const f = queue[state.served];
const events = JSON.parse(readFileSync('events.json', 'utf8'));
const record = events.find((e) => e.id === f.id);
state.served++;
writeFileSync(stateFile, JSON.stringify(state) + '\n');

console.log(`=== flagged event ${state.served} of ${queue.length} ===`);
console.log(`Reasons: ${f.reasons.join('; ')}`);
console.log(`Record: ${JSON.stringify(record ?? f)}`);
const dup = f.reasons.map((r) => r.match(/possible duplicate of (\w+)/)?.[1]).find(Boolean);
if (dup) console.log(`Possible duplicate: ${JSON.stringify(events.find((e) => e.id === dup) ?? 'already removed')}`);
if (f.reasons.some((r) => r.startsWith('url ') || r === 'no start time' || r.includes('listing page'))) console.log(page(f.url, f.title));
console.log(`=== Write your decision to spot/${state.served}.json, then run node flag.mjs ===`);

function page(url, title) {
  const r = fetchPage(url);
  if (!r.markdown) return `--- page (${r.error || 'no text'}) ---\n(no page text; if the link looks dead, remove the event, otherwise keep it)`;
  const text = r.markdown;
  const at = text.toLowerCase().indexOf(title.toLowerCase().slice(0, 25));
  const start = at > 500 ? at - 500 : 0;
  return `--- page (${r.how}), ${Math.min(PAGE_CHARS, text.length - start)} of ${text.length} chars ---\n${text.slice(start, start + PAGE_CHARS)}`;
}

function writeNotes() {
  const lines = [
    '# Spot-check',
    '',
    `Flagged: ${queue.length}. Reviewed: ${state.served}. Kept: ${state.kept}. Fixed: ${state.fixed}. Removed: ${state.removed.length}.`,
    '',
    ...state.removed.map((r) => `- Removed ${r}`),
  ];
  mkdirSync('notes', { recursive: true });
  writeFileSync('notes/spot-check.md', lines.join('\n') + '\n');
}
