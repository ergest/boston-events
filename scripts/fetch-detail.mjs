// Fetches one event detail page for a source, with guards:
//   node fetch-detail.mjs <id> <url>
// - the url must appear in the source's own listing (ground/<id>/): no guessed links
// - at most MAX_DETAILS detail pages per source
// - the page is trimmed like listing pages and saved as raw/<id>/detail-N.md
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchPage } from './page.mjs';

const MAX_DETAILS = 5;
const [id, url] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(id ?? '') || !/^https?:\/\//.test(url ?? '')) {
  console.error('usage: node fetch-detail.mjs <source-id> <url>');
  process.exit(1);
}
const dir = `raw/${id}`;
if (!existsSync(dir)) {
  console.error(`No ${dir}/ — wrong source id?`);
  process.exit(1);
}
const files = readdirSync(dir);
const ground = `ground/${id}`;
const listing = existsSync(ground) ? readdirSync(ground).map((f) => readFileSync(`${ground}/${f}`, 'utf8')).join('\n') : '';
if (!listing.includes(url.replace(/\/+$/, ''))) {
  console.error(`Refused: ${url} does not appear in the ${id} listing. Only open links copied from raw/${id}/; never guess URLs.`);
  process.exit(1);
}
const done = files.filter((f) => /^detail-\d+\.md$/.test(f)).length;
if (done >= MAX_DETAILS) {
  console.error(`Refused: already fetched ${MAX_DETAILS} detail pages for ${id}. Work with what you have; omit fields you can't confirm.`);
  process.exit(1);
}
const r = fetchPage(url);
if (!r.markdown) {
  console.error(`Could not read ${url}: ${r.error || 'no text'}`);
  process.exit(1);
}
const out = `${dir}/detail-${done + 1}.md`;
writeFileSync(out, `<!-- ${url} -->\n` + r.markdown);
console.log(`Saved ${out} (${MAX_DETAILS - done - 1} detail fetches left for ${id}).`);
