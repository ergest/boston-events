# Find events the registry missed

The per-source codons have already collected events from every site in `sources.json`. Your job is to find notable events inside the `window.json` window that they missed: one-off festivals, street fairs, pop-up markets, neighborhood events, openings, races, and events at venues with no registry source.

You work through a fixed list of searches, one at a time, with `node search.mjs`. It runs each search for you and prints the results. Do not search or fetch pages any other way: never run `firecrawl`, `curl` or your own scripts. Credits are limited, and the script enforces the budget.

## Loop

First read `window.json`. Then:

1. Run `node search.mjs`. It prints one query and its results.
2. Pick the results that look like specific events (or event listings) inside the window, in one of the window's cities. Open up to 3 of them with `node search.mjs --open <url>`, copying the URL exactly from the results.
3. For each candidate event, run `node known.mjs "<title>"`. Skip it if a known event is the same one.
4. Confirm each new event's date on the page you opened; never add an event you only saw in a search snippet. Build records in the shape `check.mjs` expects, with `source` set to the site you confirmed it on (e.g. "Somerville Arts Council") and `url` set to the event's own page.
5. Write the new events (at most 10) to the part file `search.mjs` names, e.g. `events/parts/web-search-1.json`. If the query found nothing new, run `node search.mjs --none` instead.
6. Run `node search.mjs` for the next query. Repeat until it says all queries are done.

Keep your reasoning short: one query, one part file, then move on. Never collect events from several queries and write them together.

## Finish

1. Run `node join.mjs web-search`, then `node check.mjs events/web-search.json`.
2. Fix every problem it reports in the part files, then rerun the join and the check. Do not finish while it fails.

`notes/web-search.md` (queries, results and productive sites) is written for you.
