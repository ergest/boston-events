// Hands a source's fetched data to its agent one chunk at a time, so a local model's context
// stays small and every chunk's events are saved before the next is read:
//   node chunk.mjs <id>          prints the next chunk from chunks/<id>/
//   node chunk.mjs <id> --none   the current chunk had no usable events; prints the next one
// It refuses to move on until a new events/parts/<id>-N.json exists (or --none is given).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const [id, flag] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(id ?? '') || (flag && flag !== '--none')) {
  console.error('usage: node chunk.mjs <source-id> [--none]');
  process.exit(1);
}
const dir = `chunks/${id}`;
const files = existsSync(dir)
  ? readdirSync(dir).sort((a, b) => order(a) - order(b))
  : [];
const stateFile = `${dir}/.state.json`;
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : { served: 0, parts: 0 };
const parts = existsSync('events/parts') ? readdirSync('events/parts').filter((f) => new RegExp(`^${id}-\\d+\\.json$`).test(f)).length : 0;
const chunkFiles = files.filter((f) => !f.startsWith('.'));

if (state.served > 0 && parts <= state.parts && flag !== '--none') {
  console.error(`Not yet: save the events from chunk ${state.served} first, to events/parts/${id}-${parts + 1}.json (at most 10 per part), then run this again. If chunk ${state.served} had no usable events, run: node chunk.mjs ${id} --none`);
  process.exit(1);
}
// After the last chunk, join the parts here rather than rely on the agent to remember.
if (state.served >= chunkFiles.length) {
  const r = spawnSync('node', ['join.mjs', id], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`All ${chunkFiles.length} chunk(s) done, but joining the parts failed:\n${(r.stderr || r.stdout).trim()}\nFix the part files, then run: node join.mjs ${id}`);
    process.exit(1);
  }
  console.log(`All ${chunkFiles.length} chunk(s) done. ${r.stdout.trim()}\nNow run: node check.mjs events/${id}.json (fix any problem in the part files, then node join.mjs ${id} and check again), and write notes/sources/${id}.md.`);
  process.exit(0);
}
const next = chunkFiles[state.served];
writeFileSync(stateFile, JSON.stringify({ served: state.served + 1, parts }) + '\n');
console.log(`=== chunk ${state.served + 1} of ${chunkFiles.length} (${next}) ===`);
console.log(readFileSync(`${dir}/${next}`, 'utf8'));
console.log(`=== end of chunk ${state.served + 1} of ${chunkFiles.length}. Save its events to events/parts/${id}-${parts + 1}.json (or run node chunk.mjs ${id} --none), then run node chunk.mjs ${id} ===`);

// events-N.json first, then page-N.md, each in numeric order.
function order(f) {
  const m = f.match(/^(events|page)-(\d+)\./);
  return m ? (m[1] === 'events' ? 0 : 1e6) + Number(m[2]) : 2e6;
}
