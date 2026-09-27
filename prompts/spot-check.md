# Spot-check flagged events

A script merged every source into `events.json` and flagged suspicious events in `flagged.json`. You review them one at a time with `node flag.mjs`. Each run prints one flagged event: why it was flagged, its record, and (when useful) the text of its page, already fetched for you. Do not fetch pages yourself: never run `firecrawl`, `curl` or your own scripts.

## Loop

1. Run `node flag.mjs`.
2. Decide from what it printed, and write your decision to the `spot/<n>.json` file it names:
   - `{"action": "keep"}`: the event is fine as it is, or you can't tell.
   - `{"action": "fix", "set": {"startTime": "19:00", "registerUrl": "https://..."}}`: correct or add fields the page shows. Allowed fields: title, date, endDate, startTime, endTime, venue, address, city, price, url, registerUrl, description, category.
   - `{"action": "remove", "why": "cancelled"}`: remove it only when the page says it is cancelled, postponed or sold out, the date is outside the window, or the link is dead and the page text shows nothing about the event.
3. Run `node flag.mjs` again. It saves your decision and prints the next event. Repeat until it says all are done.

How to judge each reason:

- **`url returned HTTP 401/403/406/429`**: usually bot blocking. If the page text confirms the event, keep it (fixing any wrong field).
- **`url returned HTTP 404` or `url unreachable`**: remove it unless the page text shows the event.
- **`url is a source listing page`**: keep the event; if the page text has a link to the event's own page, set `url` to it.
- **`no start time`**: set `startTime` (24-hour `HH:MM`) if the page shows one; otherwise keep. All-day events have no time.
- **`possible duplicate of <id>`**: if both are the same event, remove this one unless it is the more complete record; otherwise keep.

Also add `registerUrl` when the page links to a ticket or RSVP page. Keep your reasoning short: one event, one decision, then move on.

## Finish

When `node flag.mjs` says all are done, run `node check.mjs` and fix every problem it reports in `events.json`. `notes/spot-check.md` is written for you.
