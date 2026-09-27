# Find new event sites for the registry

The per-source codons have collected this run's events from every site in `sources.json`. Your job is to find **sites** worth adding to the registry, mainly for the cities and categories with the fewest events: a town or city calendar, a public library, an arts council, a venue, a neighborhood association. You do not collect events.

You work through a fixed list of searches with `node discover.mjs`. It runs each search, leaves out sites already in the registry, and prints the results. Do not search or fetch pages any other way: never run `firecrawl`, `curl` or your own scripts.

## Loop

1. Run `node discover.mjs`. It prints one search and its results.
2. Pick results that look like a site's own events calendar. Skip one-off event pages, news articles, ticket resellers and big national aggregators.
3. Check up to 3 of them with `node discover.mjs --check <url>`, copying the URL exactly. It fetches the page and tells you how many days of the window it lists and whether it links a calendar feed. If a checked page links to the site's real calendar page, you may check that link next.
4. Keep a site that lists upcoming dated events in the window, is public and general-interest, and is in (or covers) one of the window's cities: `node discover.mjs --keep <url> "<site name>" "<one line: what it lists and which gap it fills>"`. If none qualifies, run `node discover.mjs --none`.
5. Run `node discover.mjs` for the next search. Repeat until it says you are finished.

Keep your reasoning short: one search, a few checks, one decision, then move on. `notes/candidate-sources.md` is written for you; the scout step turns it into registry proposals.
