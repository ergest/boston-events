// Adds Claude Haiku 5.5 and Sonnet 5.5 to the installed Hankweave's built-in model registry, so
// anthropic/claude-haiku-5-5 and anthropic/claude-sonnet-5-5 run on the Claude Agent SDK route
// (Claude Code login, no API key). Up to 0.12.0 the registry stops at Sonnet 5 / Haiku 4.5 and
// fuzzy-matches the 5.5 IDs back to those without a warning. Safe to rerun; rerun after every
// hankweave update, which replaces the patched file.
//   node scripts/patch-hankweave.mjs           # patch (keeps dist/index.js.orig)
//   node scripts/patch-hankweave.mjs --check   # exit 1 if not patched
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const bin = realpathSync(execFileSync('which', ['hankweave'], { encoding: 'utf8' }).trim());
const file = join(dirname(bin), 'index.js');
const src = readFileSync(file, 'utf8');
const version = execFileSync('hankweave', ['--version'], { encoding: 'utf8' }).trim();

const MARK = '{providerId:"anthropic",modelId:"claude-haiku-5-5"';
if (src.includes(MARK)) {
  console.log(`hankweave ${version}: already patched (${file})`);
  process.exit(0);
}
if (process.argv.includes('--check')) {
  console.error(`hankweave ${version}: not patched; run node scripts/patch-hankweave.mjs`);
  process.exit(1);
}

// Clone the registry's own Sonnet 5 entry, so the new entries have whatever shape this build expects.
const anchor = src.match(/\{providerId:"anthropic",modelId:"claude-sonnet-5",[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
if (!anchor) {
  console.error(`hankweave ${version}: no anthropic claude-sonnet-5 entry found; the bundle layout changed, patch by hand`);
  process.exit(1);
}
const entry = (id, name, cost) =>
  anchor[0]
    .replace('modelId:"claude-sonnet-5"', `modelId:"${id}"`)
    .replace('name:"Claude Sonnet 5"', `name:"${name}"`)
    .replace(/cost:\{[^}]*\}/, `cost:{${cost}}`)
    .replace(/release_date:"[^"]*"/, 'release_date:"2026-09-01"')
    .replace(/last_updated:"[^"]*"/, 'last_updated:"2026-09-01"');
const added = [
  entry('claude-haiku-5-5', 'Claude Haiku 5.5', 'input:0.1,output:0.5,cache_read:0.01,cache_write:0.125'),
  entry('claude-sonnet-5-5', 'Claude Sonnet 5.5', 'input:2,output:10,cache_read:0.2,cache_write:2.5'),
].join(',');

if (!existsSync(`${file}.orig`)) copyFileSync(file, `${file}.orig`);
writeFileSync(file, src.replace(anchor[0], `${added},${anchor[0]}`));
console.log(`hankweave ${version}: added claude-haiku-5-5 and claude-sonnet-5-5 (${file}; original in index.js.orig)`);
