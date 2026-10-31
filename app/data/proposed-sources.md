# Proposed registry changes

## Summary

- All six cities clear the 3-event minimum (Malden 33, Medford 32 lowest). Boston (1004) and Cambridge (404) dominate; weakest categories are festivals & markets (Brookline 0, Medford 0, Cambridge 2), food & drink (Malden 0), and tech & talks (Malden 0).
- Four sources are thin or empty (open-newbury, bu-spark, medford-city, somerville-arts-council) and one is broken (cache-medford, blocked by a Cloudflare challenge on every request, including the browser fallback).
- The discover step's candidates were mostly weak: most list 0-2 days of the window. Only Meet Boston and Downtown Boston Alliance are worth adding, and both are Boston, which already has plenty.
- Main changes: remove or park three dead sources, and add two Boston sources for festivals and sports. Medford, Brookline and Malden remain thin and need better discovery.

## Add

### 1. Downtown Boston Alliance (Boston festivals, arts, family)

Official downtown calendar with dated, public events (for example the Nutcracker spotlight). The iCal feed timed out (504) or was empty when I tried it, so use the events page.

```json
{
  "id": "downtown-boston-alliance",
  "name": "Downtown Boston Alliance",
  "type": "civic",
  "fetch": "page",
  "urls": ["https://www.downtownboston.org/events/"],
  "cities": ["Boston"],
  "defaultCategory": "community",
  "notes": "Downtown Boston Alliance events calendar (Tribe Events). Each event has a DETAILS link; use it as the url. Keep public in-person events; long-running exhibitions or markets get one record on the first in-window date with the run in the description."
}
```

### 2. Meet Boston Events (Boston festivals and sports)

Official visitor calendar covering festivals, sports and concerts; the candidate check found 5 window days listed. Its RSS feed returns Access Denied to plain requests, so use the page. Check that it renders under `page.mjs` before relying on it.

```json
{
  "id": "meetboston",
  "name": "Meet Boston Events",
  "type": "civic",
  "fetch": "page",
  "urls": [
    "https://www.meetboston.com/events/",
    "https://www.meetboston.com/events/festivals-and-annual-events/"
  ],
  "cities": ["Boston"],
  "defaultCategory": "festivals & markets",
  "notes": "Visitor-bureau calendar. Use each event's own page as url. Keep festivals, sports and public performances; many items repeat from Do617 and Boston Calendar, so expect duplicates. Multi-day festivals: one record on the first in-window date."
}
```

Candidates not added (0 usable window days, or redundant):
- Brookline Town Calendar and Somerville Public Library: 0 days listed.
- Cambridge Public Library LibCal: its feed works (`https://cambridgepl.libcal.com/ical_subscribe.php?src=p&cid=7052`) but had no November events, and the branches are already in `cambridge-city`.
- City of Malden calendar: only 2 days listed, no feed. Worth revisiting if Malden stays thin.

## Fix

### cache-medford (broken)

Every request returns a Cloudflare "Just a moment" challenge (HTTP 403 for scripts). `page.mjs` hit the same challenge, so there is no known free route. Recommend removal (see below) rather than a fix. If kept, the only change that could help is switching to the page fetch, which I could not confirm works:

```json
{
  "id": "cache-medford",
  "name": "CACHE in Medford",
  "type": "venue",
  "fetch": "page",
  "urls": ["https://www.cacheinmedford.org/event-calendar/list/"],
  "cities": ["Medford"],
  "defaultCategory": "arts & theater",
  "notes": "Medford arts and culture: concerts, workshops, community days. Keep public events only. Site sits behind a Cloudflare challenge; page fetch may fail."
}
```

### medford-city (thin)

The calendar page only lists through 2026-10-31 and is mostly board meetings. It is unlikely to improve for November. Keep it for now, but add the `medfordma.myrec.com` calendar as a second URL if a later run confirms it lists events (the discover check found 2 window days):

```json
{
  "id": "medford-city",
  "name": "City of Medford events calendar",
  "type": "civic",
  "fetch": "page",
  "urls": [
    "https://www.medfordma.org/about/events-calendar",
    "https://medfordma.myrec.com/info/calendar/default.aspx"
  ],
  "cities": ["Medford"],
  "defaultCategory": "community",
  "notes": "Skip board/commission meetings, hearings and recurring classes. The myrec calendar is the parks and recreation calendar; keep only public one-off events."
}
```

## Remove

- `open-newbury`: lists no events in the window. Summer Sundays ended 2026-10-11 and the Holiday Stroll is 2026-12-06. This is seasonal, so re-add next spring.
- `bu-spark`: no dated events in the window (Demo Day is 2026-12-11). The recurring Wednesday sessions have no dates or event pages.
- `cache-medford`: blocked by Cloudflare (see Fix). Remove unless a person has another way to reach the feed.
- `somerville-arts-council`: only 1 event in the window. Keep if you value the SomerWrites series, otherwise drop. Somerville is already at 134 events.
