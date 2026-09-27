// Fetches a web page as markdown without paid services: curl first, and when that is blocked or
// returns a JavaScript shell, a headless local browser (Brave, Chrome or Chromium).
//   node page.mjs <url>        prints the page as markdown (for agents)
//   import { fetchPage } ...   returns { markdown, how, error }
// Links are kept as absolute [text](url), because check.mjs grounds event links in the page text.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { trimPage } from './pagetrim.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const BROWSERS = [
  process.env.BROWSER,
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
// A curl result with little text, few dates or a bot challenge is retried in the browser
// (event listings that load with JavaScript come back from curl as navigation only).
const MIN_TEXT = 3000;
const MIN_DATES = 8;
const CHALLENGE = /just a moment|attention required|access denied|verify you are human|enable javascript and cookies/i;

export function fetchPage(url, { browser = 'auto', trimParagraphs = 0 } = {}) {
  const finish = (r) => ({ ...r, markdown: r.markdown ? trimPage(shorten(r.markdown, trimParagraphs)) : '' });
  let best = { markdown: '', how: '', error: '' };
  if (browser !== 'only') {
    const c = spawnSync('curl', ['-sL', '--compressed', '--max-time', '25', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', '-w', '\n%{http_code}', url], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const out = c.stdout ?? '';
    const code = out.slice(out.lastIndexOf('\n') + 1);
    const html = out.slice(0, out.lastIndexOf('\n'));
    const markdown = code === '200' ? htmlToMarkdown(html, url) : '';
    best = { markdown, how: `curl (HTTP ${code || 'error'})`, error: code === '200' ? '' : `curl got HTTP ${code || 'error'}` };
    if (usable(markdown, html) || browser === 'never') return finish(best);
  }
  const bin = BROWSERS.find((b) => existsSync(b));
  if (!bin) return finish({ ...best, error: best.error || 'page looks like a JavaScript shell and no local browser was found (set BROWSER)' });
  // Headless mode uses its own temporary profile; a fresh --user-data-dir hangs Brave on first-run setup.
  const b = spawnSync(bin, ['--headless=new', '--disable-gpu', `--user-agent=${UA}`, '--virtual-time-budget=10000', '--dump-dom', url], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 << 20 });
  const html = b.stdout ?? '';
  const markdown = html ? htmlToMarkdown(html, url) : '';
  const rendered = { markdown, how: 'browser', error: b.error ? `browser: ${b.error.code}` : CHALLENGE.test(text(html).slice(0, 2000)) ? 'browser got a bot challenge page' : '' };
  const score = (m) => dateCount(m) * 1e6 + m.length;
  return finish(score(markdown) > score(best.markdown) ? rendered : best);
}

// Caps the plain text that follows each heading or list item at n characters (0 = keep all), so a
// listing with long descriptions stays small. Headings, list markers, links and times stay whole.
function shorten(markdown, n) {
  if (!n) return markdown;
  let budget = n;
  const out = [];
  for (const line of markdown.split('\n')) {
    const t = line.trim();
    if (!t || /^(#|-|\||\[)/.test(t) || t.includes('](') || /^\d{1,2}(:\d\d)?\s*[ap]\.?m/i.test(t)) {
      if (/^(#|-)/.test(t)) budget = n;
      out.push(line);
    } else if (budget > 0) {
      out.push(t.length > budget ? t.slice(0, budget).replace(/\s+\S*$/, '') + ' …' : t);
      budget -= t.length;
    }
  }
  return out.join('\n');
}

function usable(markdown, html) {
  return text(html).length >= MIN_TEXT && !CHALLENGE.test(text(html).slice(0, 2000)) && dateCount(markdown) >= MIN_DATES;
}

// Mentions of a calendar date, in any common format, outside of links.
function dateCount(markdown) {
  const plain = markdown.replace(/\]\([^)]*\)/g, ']');
  const month = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
  return (plain.match(new RegExp(`\\b(?:${month})\\.? \\d{1,2}\\b|\\b\\d{1,2} (?:${month})\\b|\\b\\d{1,2}/\\d{1,2}\\b|\\b20\\d\\d-\\d\\d-\\d\\d\\b`, 'gi')) ?? []).length;
}

function text(html) {
  return html.replace(/<(script|style|noscript|svg|head|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Registry URLs may carry window dates, e.g. ?start={start:YYYYMMDD} or {start+7:YYYY-MM-DD},
// so a listing can be asked for exactly the run's dates.
export function expandUrl(url, window) {
  return url.replace(/\{(start|end)(?:([+-]\d+))?:(YYYYMMDD|YYYY-MM-DD)\}/g, (_, which, offset, format) => {
    const d = new Date(`${window[which]}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(offset ?? 0));
    const iso = d.toISOString().slice(0, 10);
    return format === 'YYYYMMDD' ? iso.replace(/-/g, '') : iso;
  });
}

export function htmlToMarkdown(html, baseUrl) {
  let h = html.replace(/\r/g, '').replace(/<(script|style|noscript|svg|head|template|iframe|select)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  // Prefer the main content, as a scraper's "main content only" would; fall back to the body.
  const main = h.match(/<main[\s>][\s\S]*<\/main>/i)?.[0];
  if (main && text(main).length > 1500) h = main;
  h = h.replace(/<(nav|footer)[\s>][\s\S]*?<\/\1>/gi, ' ');
  // Widgets (e.g. Ticketmaster's) keep an element's link in data-url instead of an <a href>.
  h = h.replace(/<(\w+)\s[^>]*?data-(?:url|href|link)=["'](https?:[^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, href, inner) => `<a href="${href}">${inner}</a>`);
  const abs = (href) => {
    try {
      return new URL(decode(href), baseUrl).href;
    } catch {
      return '';
    }
  };
  return decode(
    h
      .replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => {
        const link = /^(javascript:|mailto:|tel:|#)/i.test(href) ? '' : abs(href);
        const label = inline(t) || (t.match(/alt=["']([^"']+)/i)?.[1] ?? '');
        return link && label ? `[${label}](${link})` : label;
      })
      // Headings after links, so a linked title keeps its link.
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(Number(n))} ${inline(t)}\n\n`)
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<(br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|section|article|tr|ul|ol|table|header|aside|dl|dt|dd|time|figure|figcaption)[^>]*>/gi, '\n')
      .replace(/<\/?(td|th)[^>]*>/gi, ' | ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/(\| *){2,}/g, '| ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inline(t) {
  return t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(quot|amp|lt|gt|nbsp|apos|rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip|rarr|larr|middot|bull|times|eacute|copy);/g, (_, e) => ({ quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', rarr: '→', larr: '←', middot: '·', bull: '•', times: '×', eacute: 'é', copy: '©' })[e]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const url = process.argv[2];
  if (!/^https?:\/\//.test(url ?? '')) {
    console.error('usage: node page.mjs <url>');
    process.exit(1);
  }
  const r = fetchPage(url);
  if (!r.markdown) {
    console.error(`Could not read ${url}: ${r.error || 'no text'}`);
    process.exit(1);
  }
  console.log(`<!-- ${url} (${r.how}) -->\n${r.markdown.slice(0, 12000)}${r.markdown.length > 12000 ? `\n\n[TRUNCATED: ${r.markdown.length} chars; first 12000 shown]` : ''}`);
}
