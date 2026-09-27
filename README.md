# Greater Boston Events

A [Hankweave](https://hankweave.southbridge.ai) hank that collects the next two weeks of events in Boston and nearby cities, and a small static app to browse them, register, and add them to your calendar.

**Live demo:** https://ergest.github.io/boston-events-hank/ (a snapshot from one run; it is not updated automatically)

![The events app: a day strip, filter chips and an agenda list](docs/screenshot.png)

A hank is a sequence of AI agent steps ("codons") with scripts around them. This one runs one codon per event site in a registry, mostly on a local model, then web-searches for what the registry missed, spot-checks suspicious events, and proposes new sources. Scripts do the fetching and hold every agent to small, checkable steps: data is handed out one chunk at a time, and every URL, date and time has to appear in the fetched page.

The app is a single HTML file with no build step. Open `app/index.html` locally, or serve the repository with GitHub Pages.

## How it works

![How a run works: registry, build, preflight, 25 source codons, web-search, spot-check, scout, export, app](docs/hank.svg)

The same flow as text:

```
data/sources.json ──► scripts/build-hank.mjs ──► hank.json   (generated; don't hand-edit)

preflight       [local]   local model server up and answering? otherwise stop the run (~3s)
src-<id>  × N   [local]   one codon per registry source, on Tiel-Coder 35B (4-bit) via Unsloth Studio + Pi
                          rig: fetch-source.mjs → ground/<id>/ (full copy) + chunks/<id>/ (~12K-char pieces)
                          agent: node chunk.mjs <id> hands out one chunk at a time; it must save that
                                 chunk's events to a part file before getting the next
                                 → events/<id>.json, notes/sources/<id>.md (ok|thin|broken)
                          check.mjs rejects any url, date, time or feed title not found in ground/<id>/
web-search      [sonnet]  search.mjs serves 10 fixed queries one at a time (thin cities first) → events/web-search.json
spot-check      [sonnet]  rig: merge.mjs (merge, dedupe, url checks, flags) → flag.mjs serves one flagged event at a time
scout           [sonnet]  coverage gaps + broken sources → proposed-sources.md (never edits the registry)
export          [script]  check.mjs && export.mjs → app/data/events.js
```

Each run replaces the previous data. Per-source codons use `onFailure: ignore`, so one broken site doesn't stop the run.

## Run it

Requires:

- Unsloth Studio serving the source model on `127.0.0.1:8888`, registered in Pi's `~/.pi/agent/models.json` under the `unsloth-hank` provider. That provider is the same server with hank-only settings, so your interactive Pi setup (`unsloth`) is untouched:
  - `contextWindow: 52000`, so Pi compacts the conversation (codons set `autoCompact: true`) at about 36K tokens, before long context slows the model down or runs Unsloth out of GPU memory (it caps MLX at ~47 GB; a 45K context OOMed);
  - `maxTokens: 8000`;
  - `compat: { thinkingFormat: "chat-template", chatTemplateKwargs: { enable_thinking: false } }`, which turns thinking off. Extraction is copying, and thinking was most of each call's output. Unsloth ignored `reasoning_effort: "low"`.
- Only one large model loaded in Unsloth during a run; two at once pushes a 64 GB Mac into swap.
- `ANTHROPIC_API_KEY` for the Sonnet steps (web-search, spot-check, scout).
- A logged-in Firecrawl CLI (`firecrawl --status`), used only for web searches.
- Brave, Chrome or Chromium installed (or `BROWSER=/path/to/binary`), for pages that need JavaScript. `scripts/page.mjs` fetches with `curl` first and renders the page headlessly only when `curl` is blocked or gets a JavaScript shell.

Source codons default to `pi/unsloth-hank/peculiar-ragdoll/Tiel-Coder-35B-A3B-MLX-oQ4e-MTP`. Tiel-Coder invented URLs in an early bake-off, so `check.mjs` grounds every link, date, time and feed title in `ground/<id>/`, and `fetch-detail.mjs` only opens links from the listing. The 4-bit build is used over the 6-bit because it's about 1.5× faster and 8 GB smaller. To use a different model:

```sh
node scripts/build-hank.mjs --source-model pi/unsloth-hank/<model>   # another local model (add it to unsloth-hank first)
node scripts/build-hank.mjs --source-model haiku                # cloud Haiku, no local server needed
node scripts/build-hank.mjs --only mit,ica --no-tail --out trial.json   # quick trial on a few sources
```

```sh
node scripts/build-hank.mjs                     # regenerate hank.json after editing sources.json
hankweave hank.json data/ --validate
hankweave hank.json data/ --headless --start-new -e ~/hank-runs/boston-events -o app/data --overwrite-output
open app/index.html
```

`-o app/data` is where the app reads `events.js`. The same folder also gets `proposed-sources.md`, `flagged.json` and `notes/`.

## After each run: review the registry proposals

1. Read `app/data/proposed-sources.md`.
2. Paste the approved **Add** and **Fix** entries into `data/sources.json`, and delete approved **Remove** entries.
3. Run `node scripts/build-hank.mjs`.

## Configure

- `data/config.json`: cities, `daysAhead` (default 14), categories, and `minEventsPerCity` (the threshold the scout uses to spot gaps).
- `data/sources.json`: one entry per source.

  ```json
  { "id": "ica", "name": "Institute of Contemporary Art", "type": "venue", "fetch": "json",
    "urls": ["https://www.icaboston.org/events/"], "cities": ["Boston"],
    "defaultCategory": "arts & theater", "notes": "optional instructions for this source's agent" }
  ```

  `type` is one of aggregator, civic, university or venue; it sets the codon order. `fetch` is one of: `ics`, a calendar feed parsed by script; or `page`, listing page(s) fetched as markdown by `page.mjs` that the agent extracts events from. Both are free. Prefer a feed when a site has one: many calendars that look JavaScript-only (Trumba, LibCal, Localist) publish an ICS link. Big feeds can add an `exclude` rule (`requireLocation`, `categories`, `titles`) that drops noise before the agent sees it. A feed event repeated on 3+ days (an exhibition) becomes one record with an `endDate`. URLs can carry the run's dates, e.g. `?start={start:YYYYMMDD}` or `{start+7:YYYY-MM-DD}` (also `end`), for calendars that take a date range. A `page` source with long descriptions can set `trimParagraphs` (e.g. 150) to keep only that many characters of text per listing item.

## Cost

- **Firecrawl:** search only: web-search runs 10 searches and scout at most 5, about 15 credits a run. Every page (listings, detail pages, spot-check, search results) is fetched for free by `page.mjs`. To finish a run whose tail failed without refetching sources, build with `--only '' --reuse <old agentRoot> --no-web-search`. The free plan allows 2 jobs at once; `firecrawl.mjs` waits and retries when both are busy.
- **Models:** the local source codons cost $0 and take about 2–5 minutes each, so 30 sources is roughly 1.5–2 hours. The Sonnet steps are capped at $4 in total, and with `--source-model haiku` each source codon adds up to $0.30.

## Scheduling later

The run command is non-interactive, so it can go into cron or launchd, or a Claude Code `/schedule` routine, unchanged.

## License

MIT; see [LICENSE](LICENSE). Event listings in `app/data/` belong to their original publishers; each event links back to its source.
