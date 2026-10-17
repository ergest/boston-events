# Proposed source changes

## Summary

- Coverage is uneven. Boston (323) and Cambridge (200) are well covered. Somerville (34), Medford (51) and Brookline (64) meet the 3-per-city minimum. Malden has only 4 events and no arts, music, family, tech or sports.
- Only one source is `thin`: `open-newbury`. Its page has no dates after Oct 11, so I propose removing it.
- Several page sources only list the first day or two of the window: `do617`, `boston-calendar`, `bostoncentral` (Oct 17 only), `boston-gov` (to Oct 21) and `somerville-city` (to Oct 19). `cache-medford` stops at Oct 21 because its ICS feed returns 30 events per request. I propose a second feed URL for it (see Fix).
- Highest-value additions: Patch Malden, Brookline.News Events, Somerville Arts Council, Cambridge Office for Tourism (ICS) and Boston Public Market.
- I did not search the web. I only opened candidate pages and tried feed URLs with `curl` or `page.mjs`.

## Add

### 1. patch-malden — Patch Malden Calendar
Reason: Malden has only 4 events, and the page lists 9 of the 15 window days. It is a `page` fetch because no feed exists (`calendar.ics` returned nothing). The calendar mixes in neighbouring towns (Stoneham, Winchester, Medford), so the city must come from the venue text.
```json
{ "id": "patch-malden", "name": "Patch Malden Calendar", "type": "civic", "fetch": "page", "urls": ["https://patch.com/massachusetts/malden/calendar"], "cities": ["Malden", "Medford"], "defaultCategory": "community", "notes": "Community calendar that also covers nearby towns. Set city from the venue or address text; keep only Malden and Medford events and skip Stoneham, Winchester, Melrose and other towns. Skip sign-up and registration promos (for example youth hockey signups) and school open houses." }
```

### 2. brookline-news — Brookline.News Events
Reason: Brookline has no food & drink or festivals & markets events, and this page lists 13 of 15 window days. Each entry has a category tag, a date and time, and a sponsor link. The only feed link the discover step found is a single LibCal event page, not a feed, and `?ical=1` returns HTML, so this stays a `page` fetch. The page is also dated per event.
```json
{ "id": "brookline-news", "name": "Brookline.News Events", "type": "civic", "fetch": "page", "urls": ["https://brookline.news/events/"], "cities": ["Brookline"], "notes": "Community events calendar. Each entry shows a date, time, category tags and a sponsor's link; use the sponsor's link as url. Many events appear twice, so keep one. Skip library events already covered by brookline-library, and skip online events. Map tags to categories: Food & Wine to food & drink, Families & Children to family, Recreation & Outdoors to sports & outdoors, Music & Dance to music." }
```

### 3. somerville-arts-council — Somerville Arts Council
Reason: Somerville has little in music and arts & theater (2 and 5 events). The page lists clear dates, times and venues. The ICS feed (`/events/?ical=1`) includes events from 2010 on and almost nothing in the window, so it is not usable; use the page instead.
```json
{ "id": "somerville-arts-council", "name": "Somerville Arts Council", "type": "civic", "fetch": "page", "urls": ["https://somervilleartscouncil.org/events/"], "cities": ["Somerville"], "defaultCategory": "arts & theater", "notes": "Arts, music and community events with venue names; all Somerville unless the venue is elsewhere. Use the category links (Music and so on) to pick the category. Skip grant deadlines, workshops for artists only and past events." }
```

### 4. cambridge-tourism — Cambridge Office for Tourism
Reason: The ICS feed works at `https://cambridgeusa.org/events/?ical=1`. It gives Cambridge tourism events (exhibits, music, theater, festivals) and is a different mix from the university and city feeds. A check found about 7 entries in the window, so the gain is modest. Many are exhibitions with long runs, so record those once.
```json
{ "id": "cambridge-tourism", "name": "Cambridge Office for Tourism", "type": "civic", "fetch": "ics", "urls": ["https://cambridgeusa.org/events/?ical=1"], "cities": ["Cambridge"], "defaultCategory": "arts & theater", "notes": "Tourism events feed (Harvard Sq, Central Sq, Kendall and so on). Long-running exhibitions: one record on the first in-window date with the full run in the description. Skip events already in the harvard or mit feeds if duplicated." }
```

### 5. boston-public-market — Boston Public Market Events
Reason: Boston food & drink is only 20 events. The market calendar has tastings, classes, trivia, kids' hours and live music. The discover step found only 2 days in the window, but the month grid page also lists later dates. The `?ical=1` URL returns HTML, so use the page.
```json
{ "id": "boston-public-market", "name": "Boston Public Market", "type": "venue", "fetch": "page", "urls": ["https://bostonpublicmarket.org/events/"], "cities": ["Boston"], "defaultCategory": "food & drink", "notes": "Month-grid calendar. Keep tastings, classes, trivia, kids' hours, yoga and live music dated Oct 17-31. Multi-day Oktoberfest items marked All-day: one record on the first in-window date. Face painting and kids' activity hours: category family." }
```

## Fix

### cache-medford
Problem: the feed returns only the next 30 events, so everything after Oct 21 is missing (29 events, all Oct 17–21). Medford has no coverage after that. The same URL with `&tribe-bar-date=2026-10-22` returns events through Oct 30 (tested), so add it as a second URL.
```json
{ "id": "cache-medford", "name": "CACHE in Medford", "type": "venue", "fetch": "ics", "urls": ["https://www.cacheinmedford.org/event-calendar/list/?ical=1", "https://www.cacheinmedford.org/event-calendar/list/?ical=1&tribe-bar-date=2026-10-22"], "cities": ["Medford"], "defaultCategory": "arts & theater", "notes": "Medford arts and culture: concerts, workshops, community days. Keep public events only. The feed returns 30 events per request, so the second URL starts from Oct 22; events can appear in both, so keep one record each." }
```

### assembly-row (check only)
Its feed is also an Events Calendar feed and may cap at 25 entries. Notes say 11 events fell in the window, so no change is needed.

### Single-day listings (no feed found, no change proposed)
`do617`, `boston-calendar`, `bostoncentral`, `boston-gov` and `somerville-city` cover only the first days of the window. I did not find a feed for them. If the pipeline can pass a date to the page, adding date-specific URLs would help. This is for the person to decide.

## Remove

- `open-newbury`: marked `thin`. The page lists dates only through Oct 11, so there is nothing in this window, and the next listed date is an unannounced December stroll. Its 0 events come from the program ending for the season. Re-add in spring if wanted.

## Candidates not proposed

- Boston `meetboston.com/events` (3 days) and `brookline.gov/calendar.aspx` (9 days) and `cityofmalden.org/calendar.aspx` (11 days). The Malden city calendar is a possible later addition, but its CivicPlus calendar is mostly administrative meetings and I didn't confirm its contents.
- `cambridgepl.libcal.com` (2 days): the cambridge-city feed already carries the library branches.
- The remaining checked sites list 0 days of the window.
