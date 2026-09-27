// Shrinks scraped markdown so local models keep a small context: drops images, filter
// checkboxes and blank-line runs, keeps every link (the checker grounds URLs in raw/),
// and caps the result, marking any truncation so the agent knows the page was cut.
export const PAGE_CAP = 80000;

export function trimPage(md, cap = PAGE_CAP) {
  const original = md.length;
  let t = md
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '') // linked images
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/^\s*- \[[ x]\] .*$/gm, '') // filter checkboxes
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  if (t.length > cap) {
    t = t.slice(0, t.lastIndexOf('\n', cap)) + `\n\n[TRUNCATED: page was ${original} chars; only the first ${cap} chars after cleanup are kept]\n`;
  }
  return t;
}
