// Runs the Firecrawl CLI, waiting and retrying when the plan's concurrent-job slots are busy
// (the free plan has 2; jobs from a stopped run can hold them for several minutes).
import { spawnSync } from 'node:child_process';

const RETRIES = 4;
const WAIT_SECONDS = 45;

export function firecrawl(args, timeout) {
  for (let attempt = 0; ; attempt++) {
    const r = spawnSync('firecrawl', args, { encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
    if (r.status === 0 || attempt >= RETRIES || !/concurrency slot|concurrent browsers|rate limit|429/i.test(r.stderr ?? '')) return r;
    console.log(`firecrawl busy (attempt ${attempt + 1}); waiting ${WAIT_SECONDS}s`);
    spawnSync('sleep', [String(WAIT_SECONDS)]);
  }
}
