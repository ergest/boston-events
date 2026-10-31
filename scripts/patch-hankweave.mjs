// Adds models the installed Hankweave's built-in registry is missing, so their spellings resolve
// instead of fuzzy-matching to an older model or failing the model_catalog self-test:
//   - Claude Haiku 5.5 and Sonnet 5.5, so anthropic/claude-haiku-5-5 and anthropic/claude-sonnet-5-5
//     run on the Claude Agent SDK route (Claude Code login, no API key). Up to 0.12.0 the registry
//     stops at Sonnet 5 / Haiku 4.5 and fuzzy-matches the 5.5 IDs back to those without a warning.
//   - Xiaomi MiMo-V2.6-Pro on OpenRouter (openrouter/xiaomi/mimo-v2.6-pro). 0.12.0 carries MiMo
//     V2.5 Pro only, so the 2.6 spelling fails `model_catalog` before any codon runs.
// Each entry is cloned from a neighbouring registry entry, so it has whatever shape this build
// expects. Safe to rerun; rerun after every hankweave update, which replaces the patched file.
//   node scripts/patch-hankweave.mjs           # patch (keeps dist/index.js.orig)
//   node scripts/patch-hankweave.mjs --check   # exit 1 if not patched
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const bin = realpathSync(execFileSync('which', ['hankweave'], { encoding: 'utf8' }).trim());
const file = join(dirname(bin), 'index.js');
const src = readFileSync(file, 'utf8');
const version = execFileSync('hankweave', ['--version'], { encoding: 'utf8' }).trim();

// Clones a registry entry, so the new one has whatever shape this build expects.
const DATED = [
  [/release_date:"[^"]*"/, 'release_date:"2026-09-01"'],
  [/last_updated:"[^"]*"/, 'last_updated:"2026-09-01"'],
];
const cloneEntry = (anchor, id, name, edits) => {
  let e = anchor.replace(/modelId:"[^"]*"/, `modelId:"${id}"`).replace(/name:"[^"]*"/, `name:"${name}"`);
  for (const [from, to] of edits) e = e.replace(from, to);
  return e;
};

// One block per family: the marker meaning "already patched", the entry to clone, and what to add.
const wanted = [
  {
    mark: '{providerId:"anthropic",modelId:"claude-haiku-5-5"',
    from: /\{providerId:"anthropic",modelId:"claude-sonnet-5",[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/,
    note: 'claude-haiku-5-5 and claude-sonnet-5-5',
    entries: [
      ['claude-haiku-5-5', 'Claude Haiku 5.5', [[/cost:\{[^}]*\}/, 'cost:{input:0.1,output:0.5,cache_read:0.01,cache_write:0.125}'], ...DATED]],
      ['claude-sonnet-5-5', 'Claude Sonnet 5.5', [[/cost:\{[^}]*\}/, 'cost:{input:2,output:10,cache_read:0.2,cache_write:2.5}'], ...DATED]],
    ],
  },
  {
    mark: '{providerId:"openrouter",modelId:"xiaomi/mimo-v2.6-pro"',
    from: /\{providerId:"(?:nano-gpt|openrouter)",modelId:"xiaomi\/mimo-v2\.5-pro",[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/,
    note: 'openrouter/xiaomi/mimo-v2.6-pro',
    // Prices, context and output limits are OpenRouter's for xiaomi/mimo-v2.6-pro.
    entries: [
      ['xiaomi/mimo-v2.6-pro', 'Xiaomi MiMo-V2.6-Pro', [
        [/providerId:"[^"]*"/, 'providerId:"openrouter"'],
        [/cost:\{[^}]*\}/, 'cost:{input:0.435,output:0.87,cache_read:0.0036,cache_write:0}'],
        [/attachment:!1/, 'attachment:!0'],
        [/modalities:\{[^}]*\}/, 'modalities:{input:["text","image","video","audio"],output:["text"]}'],
        ...DATED,
      ]],
    ],
  },
];

const missing = wanted.filter((w) => !src.includes(w.mark));
if (!missing.length) {
  console.log(`hankweave ${version}: already patched (${file})`);
  process.exit(0);
}
if (process.argv.includes('--check')) {
  console.error(`hankweave ${version}: not patched (${missing.map((w) => w.note).join(', ')}); run node scripts/patch-hankweave.mjs`);
  process.exit(1);
}

let out = src;
for (const w of missing) {
  const anchor = out.match(w.from);
  if (!anchor) {
    console.error(`hankweave ${version}: no entry matching ${w.from} found; the bundle layout changed, patch by hand`);
    process.exit(1);
  }
  const added = w.entries.map(([id, name, edits]) => cloneEntry(anchor[0], id, name, edits)).join(',');
  out = out.replace(anchor[0], `${added},${anchor[0]}`);
}

if (!existsSync(`${file}.orig`)) copyFileSync(file, `${file}.orig`);
writeFileSync(file, out);
console.log(`hankweave ${version}: added ${missing.map((w) => w.note).join(' and ')} (${file}; original in index.js.orig)`);
