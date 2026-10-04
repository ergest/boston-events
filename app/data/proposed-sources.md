# Proposed registry changes

## Summary
- Boston (375) and Cambridge (168) are well covered. Below the 3-event minimum or close to it: Quincy (1), Malden (10, but 0 music/family), Medford (11), Somerville (21, thin in music/arts/family).
- No source is `broken`. One is `thin`: `bu-spark` (1 event). Two `ok` sources only reach a few days of the window: `do617` (Oct 3 only) and `somerville-city` (to Oct 6).
- Highest value: add the Quincy, Medford and Malden city calendars and CACHE in Medford (a working ICS feed with 30 events in October). Widen `do617` with dated URLs.
- Brookline has 0 food & drink and Quincy has nothing outside one festival, so these categories remain weak after this run.

## Add

1. **Quincy city calendar**: Quincy has only 1 event; the page lists 13 days of the window. It mixes in meetings, so the notes tell the extractor to skip them.
```json
{ "id": "quincy-city", "name": "City of Quincy calendar", "type": "civic", "fetch": "page", "urls": ["https://www.quincyma.gov/calendar.php"], "cities": ["Quincy"], "defaultCategory": "community", "notes": "Keep public events (festivals, library, community events). Skip board/committee meetings, hearings and recurring senior-center classes." }
```

2. **CACHE in Medford**: tested, and the ICS feed is live (30 DTSTART lines in 2026-10). Medford has 0 music and 0 family events.
```json
{ "id": "cache-medford", "name": "CACHE in Medford", "type": "venue", "fetch": "ics", "urls": ["https://www.cacheinmedford.org/event-calendar/list/?ical=1"], "cities": ["Medford"], "defaultCategory": "arts & theater", "notes": "Medford arts and culture: concerts, workshops, community days. Keep public events only." }
```

3. **Medford events calendar**: lists all 15 days of the window. A `?ical=1` probe returned HTML, so there is no feed.
```json
{ "id": "medford-city", "name": "City of Medford events calendar", "type": "civic", "fetch": "page", "urls": ["https://www.medfordma.org/about/events-calendar"], "cities": ["Medford"], "defaultCategory": "community", "notes": "Skip board/commission meetings, hearings and recurring classes." }
```

4. **Malden city calendar**: lists 9 days of the window, and Malden has no music or family events. It may overlap with `malden-events`; the merge step should dedupe.
```json
{ "id": "malden-city", "name": "City of Malden calendar", "type": "civic", "fetch": "page", "urls": ["https://www.cityofmalden.org/calendar.aspx"], "cities": ["Malden"], "defaultCategory": "community", "notes": "Keep public in-person events. Skip council/board meetings and hearings." }
```

5. **Somerville Arts Council**: fills Somerville arts and music. The ICS feed at `/events/?ical=1` is stale (nothing after 2013), so use the page.
```json
{ "id": "somerville-arts-council", "name": "Somerville Arts Council", "type": "venue", "fetch": "page", "urls": ["https://somervilleartscouncil.org/events/"], "cities": ["Somerville"], "defaultCategory": "arts & theater", "notes": "Arts, music and community events. Skip grant workshops and administrative sessions." }
```

6. **Boston Public Market**: fills Boston food and family.
```json
{ "id": "boston-public-market", "name": "Boston Public Market", "type": "venue", "fetch": "page", "urls": ["https://bostonpublicmarket.org/events/"], "cities": ["Boston"], "defaultCategory": "food & drink", "notes": "Tastings, sing-alongs, kids activities, watch parties." }
```

7. **Town of Brookline calendar**: lists 3 window days. Lower value, since Brookline already has 66 events.
```json
{ "id": "brookline-town", "name": "Town of Brookline calendar", "type": "civic", "fetch": "page", "urls": ["https://www.brooklinema.gov/calendar.aspx"], "cities": ["Brookline"], "defaultCategory": "community", "notes": "Non-board public events only (e.g. Fall Community Day). Skip board/committee meetings." }
```

Not proposed: `discoverquincy.com` (4 days, probably a subset of the city calendar; it could be a later addition for Quincy). Libraries and Union Square Main had 0 days in the window.

## Fix

**do617**: the page lists Oct 3 only, so the 15-day window is barely covered. Dated URLs of the form `/events/YYYY/MM/DD` return HTTP 200 (tested with 2026/10/10).
```json
{ "id": "do617", "name": "Do617", "type": "aggregator", "fetch": "page", "urls": ["https://do617.com/events", "https://do617.com/events/2026/10/04", "https://do617.com/events/2026/10/05", "https://do617.com/events/2026/10/06", "https://do617.com/events/2026/10/07", "https://do617.com/events/2026/10/08", "https://do617.com/events/2026/10/09", "https://do617.com/events/2026/10/10", "https://do617.com/events/2026/10/11", "https://do617.com/events/2026/10/12", "https://do617.com/events/2026/10/13", "https://do617.com/events/2026/10/14", "https://do617.com/events/2026/10/15", "https://do617.com/events/2026/10/16", "https://do617.com/events/2026/10/17"], "cities": "all", "notes": "Each URL is one day; use that date for its events. Skip events outside the listed cities." }
```
The URL list needs refreshing for each window. I did not check that every date page has content.

**somerville-city**: the listing stops at Oct 6, and the calendar has a per-day view (`https://www.somervillema.gov/calendar?event_date=2026-10-DD`, linked from the month grid). I did not check that those pages list events. Suggest adding a few of them (e.g. 10-08, 10-10, 10-14) or `?page=1`, then checking the result next run. Keep the existing entry otherwise.

**bu-spark** (thin, 1 event): only one dated event in the window, and the weekly sessions are student-oriented. Replace with the Remove below, or keep as is. It costs little, so it is optional.

## Remove

- `bu-spark`: yields 1 event per window; Code & Tell is probably also on Eventbrite/Luma. Low priority; keep if you want the Spark! events.
