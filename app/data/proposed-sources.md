# Proposed source changes

## Summary

- All six cities clear `minEventsPerCity` (3); Malden (25) and Somerville (40) are the thinnest. Festivals & markets (Boston 12, Brookline 1, Cambridge 5) and food & drink (Somerville, Medford, Malden: 0) are the emptiest categories.
- Existing sources: 1 broken (`open-newbury`), 2 thin (`bu-spark`, `somerville-arts-council`). I propose removing the first two and fixing the third.
- Additions target Somerville, Medford and Malden libraries and city calendars, plus Meet Boston for Boston festivals.
- Rejected: Cambridge Public Library LibCal feed (the ICS stops at 2026-10-21, so it covers none of the window; the `days`, `limit` and `date` parameters change nothing). Malden's city iCal feed is stale (only recurring "Food Policy Council" meetings from 2024–25), so the Malden city page is proposed instead.
- Note: the Assabet library calendars only render the current month (October), so they cover Oct 23–31. A month query parameter did not work. Re-check in November.

## Add

### 1. somerville-library — fills Somerville (40 events, 0 food & drink), the lowest city after Malden.
Assabet calendar page (the library's own page is an iframe of it). Lists address and time per event.
```json
{ "id": "somerville-library", "name": "Somerville Public Library", "type": "venue", "fetch": "page", "urls": ["https://somervillepubliclibrary.assabetinteractive.com/calendar/"], "cities": ["Somerville"], "defaultCategory": "community", "notes": "Assabet calendar; the page shows the current month only. Skip meeting and study room bookings, one-on-one social work appointments, and ESOL or other recurring classes. Keep author talks, kids' programs, films, and workshops open to the public." }
```

### 2. medford-library — fills Medford (0 food & drink, 0 sports) and diversifies away from cache-medford.
Same Assabet platform.
```json
{ "id": "medford-library", "name": "Medford Public Library", "type": "venue", "fetch": "page", "urls": ["https://medfordlibrary.assabetinteractive.com/calendar/"], "cities": ["Medford"], "defaultCategory": "family", "notes": "Assabet calendar; the page shows the current month only. Skip ESOL classes, meeting and room bookings, and society business meetings. Keep toddler time, story times, author talks, film screenings, and public workshops." }
```

### 3. meetboston-events — Boston festivals & markets gap (12 events) and general coverage.
Official tourism board listing. The site also offers an RSS feed, but it is a long filtered URL limited to one week and not a standard ICS, so the page is safer.
```json
{ "id": "meetboston-events", "name": "Meet Boston Events", "type": "aggregator", "fetch": "page", "urls": ["https://www.meetboston.com/events/", "https://www.meetboston.com/events/festivals-and-annual-events/"], "cities": ["Boston", "Cambridge", "Brookline", "Somerville"], "defaultCategory": "festivals & markets", "notes": "Tourism board listing. Many entries are multi-week runs: record one event dated at the later of the start date and the window start, with the full run in the description. Skip online-only events." }
```

### 4. malden-city-calendar — Malden is the thinnest city (25 events).
The city's iCal feed is stale, so use the page. Only about 4 days of the window were parsed, so expect a modest yield.
```json
{ "id": "malden-city-calendar", "name": "City of Malden Calendar", "type": "venue", "fetch": "page", "urls": ["https://www.cityofmalden.org/calendar.aspx?CID=14"], "cities": ["Malden"], "defaultCategory": "community", "notes": "Skip board and committee meetings, including Food Policy Council, and other administrative meetings. Keep public events such as Trunk or Treat, film screenings and festivals." }
```

### 5. brookline-town-calendar — Brookline festivals & markets (1 event).
```json
{ "id": "brookline-town-calendar", "name": "Brookline Town Calendar", "type": "venue", "fetch": "page", "urls": ["https://www.brooklinema.gov/calendar.aspx"], "cities": ["Brookline"], "defaultCategory": "community", "notes": "Skip board, committee and commission meetings. Keep public events only." }
```
Low value: only 3 days of the window were found. Add last.

## Fix

### somerville-arts-council (thin: 1 event in the window)
The events page works and lists real events, but few fall inside this window, so the source is just quiet, not broken. The site's `?ical=1` feed does respond with valid ICS (WP Events plugin), but it starts in 2010 and none of the 50 entries returned fall inside the window, so it is no better. Keep the entry and add a note so the agent doesn't over-extract; revisit next month.
```json
{ "id": "somerville-arts-council", "name": "Somerville Arts Council", "type": "venue", "fetch": "page", "urls": ["https://somervilleartscouncil.org/events/"], "cities": ["Somerville"], "defaultCategory": "arts & theater", "notes": "Few events fall in any given month. Venue is often not Somerville (e.g. partner breweries); check the venue's city before assigning." }
```

## Remove

- `open-newbury` — broken. The page was a "Boston.gov Under Maintenance" notice, and it is a single-street program page, not an event listing. It produced 0 events and is covered by `boston-gov`.
- `bu-spark` — thin. It gave 0 events. The page lists only past events, a December event, and undated "Every Wednesday" recurring sessions, with no per-event pages or feed. BU events are better covered by aggregators.
