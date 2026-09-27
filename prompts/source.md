# Extract events from one source

`current-source.json` describes the source you handle (`id`, `name`, `fetch`, `cities`, optional `defaultCategory` and `notes`). Follow its `notes` if present. Below, `<id>` means its `id`.

The rig has already fetched it. You get the data **one chunk at a time** from `node chunk.mjs <id>`; it refuses to give the next chunk until you've saved the current one's events. There are two kinds of chunks:

- `events-N.json`: events already parsed from a calendar feed (`fetch: "ics"`), at most 10 per chunk and all inside the window, with `title`, `date`, `endDate` (for runs), `startTime`, `endTime`, `location`, `url`, `description` (shortened). Your job is triage: keep the public, general-interest events and map each one to the record format.
- `page-N.md`: a piece of the listing page as markdown (`fetch: "page"`): find each event inside the window and map it.

`raw/<id>/FETCH_ERROR.txt`, if present, means part or all of the fetch failed.

## Loop

First read `window.json` and `current-source.json`. Then repeat until `chunk.mjs` says all chunks are done:

1. Run `node chunk.mjs <id>` to get the next chunk.
2. Build records from it. `source` is the source's `name`. `city` must be one of the source's `cities` that matches where the event actually is (for `"all"`, any `window.json` city). Skip events outside the listed cities or the window. Use `defaultCategory` unless another category clearly fits better.
   Copy values exactly: `url` and `registerUrl` character for character (never build a link from a title), and for events from `events-N.json` chunks the `title`, `date`, `endDate`, `startTime` and `endTime` unchanged.
   A run that is on over a range of days (an exhibition, a festival, anything shown as "Through <date>" or a date range) is one record: `date` is its first day inside the window and `endDate` its last day (which may be after the window). Don't write one record per day.
3. Save them with one write to the part file `chunk.mjs` names (`events/parts/<id>-1.json`, then `-2`, …), at most **10 events per part**; if a chunk has more, write two parts. If it has no usable events, run `node chunk.mjs <id> --none` instead.

Keep your reasoning short: this is mechanical copying, not analysis. Never try to collect events from several chunks and write them together.

If a listing lacks the date or time for an otherwise good event, you may open that event's page with `node fetch-detail.mjs <id> <url>`. It saves the page as `raw/<id>/detail-N.md` for you to read. It only accepts links from this source's listing and allows at most 5 pages per source; don't call `firecrawl` directly and never guess URLs.

## Finish

1. If no part was written, write `[]` to `events/parts/<id>-1.json`.
2. `chunk.mjs` joins the parts into `events/<id>.json` after the last chunk. If you wrote `[]` yourself or changed a part since, run `node join.mjs <id>`.
3. Write `notes/sources/<id>.md`. The first line is exactly one of `status: ok`, `status: thin` (fewer than 3 usable events) or `status: broken` (fetch failed, blocked, or the page no longer lists events). Follow it with a few lines on what you saw and why, e.g. "page is a JS shell with no events", "moved to https://…".
4. Run `node check.mjs events/<id>.json` and fix every problem it reports. Fix problems in the part files, never in `events/<id>.json` directly, then rerun `node join.mjs <id>` and the check. Do not finish while it fails. Checking part files one by one is not enough: `events/<id>.json` must exist and pass.

Handle only this source. Do not read or edit other sources' files.
