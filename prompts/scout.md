# Scout for registry improvements

You maintain the source registry, but you only propose changes. A person reviews your proposals and edits `sources.json` themselves. Do not modify `sources.json` or `events.json`.

## Inputs

These all exist in your working directory:

- `notes/coverage.md`: events per city × category, and per source.
- `notes/sources/*.md`: each source's status (`ok`, `thin`, `broken`) and notes.
- `notes/candidate-sources.md`, if present: new sites the discover step found and checked, with how many days of the window each lists and any calendar feed.
- `notes/spot-check.md`: what was fixed or removed, which can point to a bad source.
- `sources.json` and `window.json`.

## Steps

1. **Broken or thin sources.** For each `broken` or `thin` source, work out why. Check whether the site moved, has a better events URL, or offers an ICS or RSS feed: look for "subscribe", "iCal" or "export" links, or try `<url>/calendar.ics`. Also check whether it only renders events with JavaScript, or has simply stopped listing events. Propose a fix, or propose removing the source.
2. **New sites.** Turn the candidates in `notes/candidate-sources.md` into registry entries, most valuable first (the ones that fill a city below `minEventsPerCity` or a nearly empty category). If a candidate links a calendar feed (`.ics`, webcal, Trumba, LibCal, Localist), propose it as `fetch: "ics"` with the feed URL; otherwise as `fetch: "page"` with its events page. You may open a candidate or a broken source's page with `node page.mjs <url>` (free) to confirm details or find its feed.

Do not search the web and never run `firecrawl`: finding sites is the discover step's job. If there are no candidates, propose only fixes and removals.

## Output

Write `proposed-sources.md` with these sections:

- **Summary**: 3–5 lines on this run's coverage and the most important changes.
- **Add**: one entry per new source. Give a one-line reason, then a JSON block that can be pasted straight into `sources.json`. Use the same fields as the existing entries (`id`, `name`, `type`, `fetch`, `urls`, `cities`, optional `defaultCategory`, `notes`).
- **Fix**: one entry per existing source to change. Give the `id`, what's wrong, and the corrected JSON entry.
- **Remove**: `id` and reason.

Propose at most 10 additions per run, most valuable first.
