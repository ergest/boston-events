# Proposed source changes

## Summary

- Every city meets `minEventsPerCity` (Malden is lowest at 33, Somerville 117). Weak spots are categories: festivals & markets (Brookline 0, Cambridge 2, Boston 11), and food & drink in Malden (0), Brookline (2), Medford (2), Somerville (3).
- Three sources are broken or thin: `open-newbury` (boston.gov was under maintenance), `bu-spark` (0 usable events), `somerville-arts-council` (1 event). Proposals below remove the first two and fix the third.
- Of the discover candidates, the City of Malden iCal feed and the Somerville Arts Council feed are the cheapest wins. Meet Boston's RSS returns "Access Denied" to curl, so it is added as a page source for festivals. Somerville Arts Council's `?ical=1` is a real feed but is mostly old events (see Fix).
- Not run through the checker: no feeds were ingested, only probed with curl.

## Add

### 1. City of Malden calendar (ICS)
The site publishes a Municode-style iCal feed. 23 entries, about 7 inside the window, which helps Malden's food & drink and community gaps. Many are recurring board or council meetings, so the exclude list matters.

```json
{ "id": "malden-city", "name": "City of Malden Calendar", "type": "city", "fetch": "ics", "urls": ["https://www.cityofmalden.org/common/modules/iCalendar/iCalendar.aspx?catID=14&feed=calendar"], "cities": ["Malden"], "defaultCategory": "community", "notes": "Municipal calendar feed. Skip board, council, commission, committee and council-on-aging meetings (e.g. Food Policy Council); keep public community events, film nights, Trunk or Treat, festivals." }
```

### 2. Meet Boston Festivals & Annual Events (page)
Official tourism board list of festivals and fairs; fills the festivals & markets category (Boston 11, Brookline 0). Its RSS feed returned "Access Denied" to curl, so use the page.

```json
{ "id": "meetboston-festivals", "name": "Meet Boston Festivals & Annual Events", "type": "tourism", "fetch": "page", "urls": ["https://www.meetboston.com/events/festivals-and-annual-events/"], "cities": "all", "defaultCategory": "festivals & markets", "notes": "Fetched with browser (JS rendered). Multi-day festivals: one record on first in-window date, with full run in description. Skip events outside the listed cities." }
```

### 3. Meet Boston Events Calendar (page)
General Boston coverage across categories, shown 5 days of the window by the check. Lower priority because it overlaps Do617 and Eventbrite.

```json
{ "id": "meetboston-events", "name": "Meet Boston Events", "type": "tourism", "fetch": "page", "urls": ["https://www.meetboston.com/events/"], "cities": "all", "notes": "Fetched with browser. RSS feed blocks curl (Access Denied), so use the page. Use detail pages for venue and times." }
```

### 4. Brookline Town Calendar (page)
Public non-board events; 3 days in window, and Brookline has 0 festivals & markets and 2 food & drink.

```json
{ "id": "brookline-town", "name": "Town of Brookline Calendar", "type": "city", "fetch": "page", "urls": ["https://www.brooklinema.gov/calendar.aspx"], "cities": ["Brookline"], "defaultCategory": "community", "notes": "Fetched with browser. Skip board, commission, committee and town meeting entries; keep public events only. The Municode iCalendar URL pattern returns an HTML page here, so there is no feed." }
```

### 5. Cambridge Public Library (ICS, limited)
A real LibCal feed exists, but it returns the first 500 entries in date order and ends 2026-10-26, so only about 10 are in the window. Worth adding only if a date-limited variant is found; the page below may cover more.

```json
{ "id": "cambridge-library", "name": "Cambridge Public Library", "type": "library", "fetch": "ics", "urls": ["https://cambridgepl.libcal.com/ical_subscribe.php?src=p&cid=7052"], "cities": ["Cambridge"], "defaultCategory": "community", "notes": "LibCal feed is capped at 500 entries and ends 2026-10-26, so it only covers the first few days of the window. All events free and public. Skip online-only entries." }
```

### 6. Somerville Public Library (page)
Check parsed 0 days, but the search snippet showed dated events, so it may be JS rendered. Try it with the browser fetch. Somerville has little food & drink, family and tech content.

```json
{ "id": "somerville-library", "name": "Somerville Public Library", "type": "library", "fetch": "page", "urls": ["https://somervillepubliclibrary.org/calendar/"], "cities": ["Somerville"], "defaultCategory": "community", "notes": "Candidate check found 0 days, probably JS rendering; verify with the first run. Skip online-only and staff events." }
```

### 7. Medford Public Library (page)
Same situation as Somerville: check parsed 0 days but the page lists dated programs (toddler time, etc.), which helps Medford family and food & drink.

```json
{ "id": "medford-library", "name": "Medford Public Library", "type": "library", "fetch": "page", "urls": ["https://medfordlibrary.org/events/"], "cities": ["Medford"], "defaultCategory": "family", "notes": "Candidate check found 0 days (HTTP 200 via curl); verify extraction on the first run. Set category per event (family, community, arts)." }
```

## Fix

### somerville-arts-council
The page works but lists only 1 in-window event. The `?ical=1` feed is a valid iCal feed, but it contains 50 entries and none with 2026 dates (oldest items first), so switching to ICS would not help yet. Keep as is, low value; consider removing if it stays at 0 or 1 next run.

```json
{ "id": "somerville-arts-council", "name": "Somerville Arts Council", "type": "arts", "fetch": "page", "urls": ["https://somervilleartscouncil.org/events/"], "cities": ["Somerville"], "defaultCategory": "arts & theater", "notes": "Thin: about 1 event per run. The WordPress ?ical=1 feed exists but returns only old entries (50, none in 2026), so it is not useful." }
```

### somerville-city
Status ok, but the listing only ran through 2026-10-26 in the last run, so most of the window is missing. No fix found from the notes alone; consider adding a second URL with `?page=1` once checked with `node page.mjs`.

## Remove

- `open-newbury`: boston.gov page returned only an "Under Maintenance" notice and 0 events. It is a single-street program page, not an event listing, and Boston is already the best covered city. Remove.
- `bu-spark`: 0 usable events. The page has only recurring "Every Wednesday" items with no dates or detail URLs, and its one-off events fall outside the window. Remove, or revisit if Spark moves to a dated calendar.
