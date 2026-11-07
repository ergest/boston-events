# Proposed source changes

## Summary
- Every city meets the 3-event minimum (Malden 25, Medford 31 are the lowest). Boston (1006) and Cambridge (373) dominate; food & drink, festivals & markets and sports & outdoors are thin outside Boston (Brookline has 0 festivals, Malden 0 tech & talks, Cambridge 6 sports).
- Broken or thin: `luma-boston` (fetch timeout only; the feed is live), `bu-spark`, `somerville-arts-council` and `open-newbury` (0–1 in-window events). `eventbrite-boston-5` produced no file at all, which is worth checking.
- Candidates: two have working ICS feeds I confirmed (CACHE in Medford, Downtown Boston BID). The two city calendars (Malden, Brookline) have no feed and are added as page sources. Meet Boston only offers RSS, which the registry can't fetch, so it is added as a page source.
- Not verified: I did not investigate `eventbrite-boston-5` or test the page fetches for the three page-source additions.

## Add

### 1. CACHE in Medford (Medford; fills a thin city)
ICS confirmed (HTTP 200, VCALENDAR) via the list URL with `?ical=1`. The raw `?post_type=tribe_events&ical=1` form returns 403 to curl, so use the list URL.
```json
{ "id": "cache-medford", "name": "CACHE in Medford", "type": "venue", "fetch": "ics", "urls": ["https://www.cacheinmedford.org/event-calendar/list/?ical=1"], "cities": ["Medford"], "defaultCategory": "tech & talks", "notes": "Medford community media and arts center (Events Calendar feed): talks, story times, makerspace sessions. Skip internal member-only sessions and classes." }
```

### 2. City of Malden Calendar (Malden)
Official calendar, 14 of 31 window days listed. No feed (the CivicPlus iCalendar URL returns HTML), so it is a page source. Mixes meetings with events.
```json
{ "id": "malden-city", "name": "City of Malden calendar", "type": "civic", "fetch": "page", "urls": ["https://www.cityofmalden.org/calendar.aspx"], "cities": ["Malden"], "notes": "Skip board/commission/council meetings, hearings and administrative notices; keep public events, workshops and community programs." }
```

### 3. Downtown Boston BID Events (Boston)
ICS confirmed: 30 VEVENTs per fetch, dated from 2026-11-02 onward (many are recurring walks and tours).
```json
{ "id": "downtown-boston", "name": "Downtown Boston Alliance events", "type": "civic", "fetch": "ics", "urls": ["https://www.downtownboston.org/?post_type=tribe_events&ical=1&eventDisplay=list"], "cities": ["Boston"], "defaultCategory": "festivals & markets", "notes": "Events Calendar feed; the fetch returns about 30 upcoming events. Record repeated daily or weekly items once, on their first in-window date. Skip online events." }
```

### 4. Brookline Town Calendar (Brookline; no festivals recorded yet)
6 of 31 window days listed; no feed (the iCalendar URL returned 403). Page source.
```json
{ "id": "brookline-town", "name": "Town of Brookline calendar", "type": "civic", "fetch": "page", "urls": ["https://www.brooklinema.gov/calendar.aspx"], "cities": ["Brookline"], "notes": "Non-board public events only. Skip board/commission meetings and hearings. Library events are covered by brookline-library." }
```

### 5. Meet Boston Events (Boston; festivals & markets)
5 of 31 window days on the first page. Only an RSS feed exists, so it is a page source and may need paging by week.
```json
{ "id": "meet-boston", "name": "Meet Boston Events", "type": "civic", "fetch": "page", "urls": ["https://www.meetboston.com/events/"], "cities": ["Boston", "Cambridge"], "defaultCategory": "festivals & markets", "notes": "Official tourism calendar: festivals, concerts, performing arts. Set city from the venue and skip entries outside the configured cities." }
```

## Fix

### luma-boston
The rig's fetch timed out (FETCH_ERROR). A retry returned HTTP 200 with 19 VEVENTs, so the feed is fine and the failure was transient. No URL change; I suggest re-running the fetch and, if it times out again, raising the timeout for this source. Entry unchanged:
```json
{ "id": "luma-boston", "name": "Luma Boston", "type": "aggregator", "fetch": "ics", "urls": ["https://api.lu.ma/ics/get?entity=discover&id=discplace-VWeZ1zUvnawYHMj"], "cities": "all", "defaultCategory": "tech & talks" }
```
(Keep the existing `notes` field as is.)

### somerville-arts-council
Its events page held one event, the Lantern Parade on Dec 17, which is after the window. The site's `?ical=1` returns a calendar, but I found no events in the Nov–Dec 2026 window in it. Somerville has 117 events, so this isn't urgent: keep it for now and re-check next month, when December listings may appear.

## Remove

- `bu-spark`: 0 events. The page lists only past dates, an event after the window (Dec 11), and recurring Wednesday items with no concrete dates.
- `open-newbury`: seasonal program. Only 1 in-window event (Holiday Stroll, Dec 6). That one event could be added by hand if it isn't already in another source.
