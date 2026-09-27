# Scout for registry improvements

You maintain the source registry, but you only propose changes. A person reviews your proposals and edits `sources.json` themselves. Do not modify `sources.json` or `events.json`.

## Inputs

These all exist in your working directory:

- `notes/coverage.md`: events per city × category, and per source.
- `notes/sources/*.md`: each source's status (`ok`, `thin`, `broken`) and notes.
- `notes/web-search.md`: sites the web-search step found productive.
- `notes/spot-check.md`: what was fixed or removed, which can point to a bad source.
- `sources.json` and `window.json`.

## Steps

1. **Broken or thin sources.** For each `broken` or `thin` source, work out why. Check whether the site moved, has a better events URL, or offers an ICS or RSS feed: look for "subscribe", "iCal" or "export" links, or try `<url>/calendar.ics`. Also check whether it only renders events with JavaScript, or has simply stopped listing events. Propose a fix, or propose removing the source.
2. **Coverage gaps.** Take every city below `minEventsPerCity`, and any category that's nearly empty across all cities. Search the web for event sites that would fill the gap: city or town calendars, public libraries, arts councils, local venues, neighborhood associations. Prefer sources with an ICS feed.
3. **Web-search finds.** Consider adding sites named in `notes/web-search.md` as registry sources.
4. For each proposed new source, open its events page with `node page.mjs <url>` (free: curl, then a local browser). Confirm that it lists upcoming dated events before you propose it. A site whose page has a calendar feed link (`.ics`, webcal, Trumba, LibCal, Localist) should be proposed as `fetch: "ics"` with the feed URL.

**Search budget: at most 5 `firecrawl search "<query>"` commands in total, one query per command; never use `firecrawl` for anything else, and never write scripts or loops that call it.** Credits are limited; when the budget is spent, propose what you have.

## Output

Write `proposed-sources.md` with these sections:

- **Summary**: 3–5 lines on this run's coverage and the most important changes.
- **Add**: one entry per new source. Give a one-line reason, then a JSON block that can be pasted straight into `sources.json`. Use the same fields as the existing entries (`id`, `name`, `type`, `fetch`, `urls`, `cities`, optional `defaultCategory`, `notes`).
- **Fix**: one entry per existing source to change. Give the `id`, what's wrong, and the corrected JSON entry.
- **Remove**: `id` and reason.

Propose at most 10 additions per run, most valuable first.
