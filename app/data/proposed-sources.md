# Proposed source changes

## Summary

- No source is marked `broken` or `thin`, but several are shallow in practice: boston-calendar and artsboston only yielded Oct 10, bostoncentral is one day, boston-gov covers Oct 10-14, and somerville-city covers Oct 10-13.
- All cities meet the minimum of 3, but Malden (8), Somerville (34) and Brookline's food/sports categories are thin. Somerville has no tech & talks events, and Malden and Medford have almost no music or food.
- Proposed 5 additions, led by Cambridge Office for Tourism (35 events, full window), Somerville Arts Council, Brookline.News and Boston Public Market. None of the candidates offers a usable ICS feed.
- Two candidates are skipped (City of Malden calendar, Meet Boston) and no removals are proposed.

## Add

1. **Cambridge Office for Tourism**: lists 35 events across the whole window, including exhibits, music, theater and festivals. Its `?ical=1` feed has only 3 in-window events, so use the page.
```json
{ "id": "cambridgeusa", "name": "Cambridge Office for Tourism", "type": "civic", "fetch": "page", "urls": ["https://cambridgeusa.org/events/month/"], "cities": ["Cambridge"], "defaultCategory": "arts & theater", "notes": "Tourism calendar for Cambridge. Use each event's own page as url. Categories on the page (Music, Theater, Kids / Families, Fairs & Festivals, Food, Lectures / Talks) map to ours. Skip classes and ongoing attractions with no date." }
```

2. **Somerville Arts Council**: public arts, music and community events in Somerville, which is below the other cities. Its `?ical=1` feed has no in-window events, so use the page.
```json
{ "id": "somerville-arts", "name": "Somerville Arts Council", "type": "civic", "fetch": "page", "urls": ["https://somervilleartscouncil.org/events/"], "cities": ["Somerville"], "defaultCategory": "arts & theater", "notes": "Multi-day entries (e.g. HONK! Oct 9-11): record once on the first date inside the window and put the full run in the description. Venue is the linked location name. Skip council meetings and grant deadlines." }
```

3. **Brookline.News Events**: 8 of 15 window days. It fills Brookline's empty food & drink and sports categories and adds family and music events.
```json
{ "id": "brookline-news", "name": "Brookline.News Events", "type": "civic", "fetch": "page", "urls": ["https://brookline.news/events/"], "cities": ["Brookline"], "defaultCategory": "community", "notes": "Sponsor-submitted community events. Use the Sponsor's link as url. Dates and times are shown per event; a multi-date event lists extra dates in its details (record the first date inside the window). Skip online-only events." }
```

4. **Boston Public Market**: dated food, music and family events in Boston, on 6 window days. It is a month-grid calendar, so read the day numbers carefully. Oct 25+ and earlier-month days also appear in the grid.
```json
{ "id": "boston-public-market", "name": "Boston Public Market", "type": "venue", "fetch": "page", "urls": ["https://bostonpublicmarket.org/events/"], "cities": ["Boston"], "defaultCategory": "food & drink", "notes": "Month-grid calendar: the grid also shows days from the adjacent months (e.g. Sep 27-30, Nov 1), so only keep cells for October 10-24. Venue is Boston Public Market, 100 Hanover St. Free events unless a price is shown." }
```

5. **Meet Boston Festivals & Annual Events**: the official tourism calendar, with 4 window days listed. It adds festivals and markets in Boston. The main events page has only 3 window days. Its feed is RSS, not ICS, so use the page.
```json
{ "id": "meetboston-festivals", "name": "Meet Boston Festivals & Annual Events", "type": "aggregator", "fetch": "page", "urls": ["https://www.meetboston.com/events/festivals-and-annual-events/"], "cities": "all", "defaultCategory": "festivals & markets", "notes": "Official tourism calendar. Many entries are multi-day or annual: record once on the first date inside the window with the full run in the description. Skip events outside our cities." }
```

Skipped candidates:
- City of Malden Calendar: mostly board and commission meetings, 7 window days and no feed. Malden is already covered by malden-events. Add it only if Malden stays thin.
- The other "checked, not kept" sites list 0-3 window days.

## Fix

- `boston-calendar` (page): the home page only shows today's events, so only Oct 10 was captured. Suggested fix: replace the URL with dated day or weekend pages. I did not verify the URL pattern, so check it before editing.
- `artsboston`: also only returned Oct 10. Check whether the calendar needs a date or paging parameter. I could not confirm a better URL.
- `somerville-city` (page, https://www.somervillema.gov/events): the page lists only Oct 10-13. Consider adding pagination or a later-dates URL if one exists. Unverified.
- `boston-gov` (page): only Oct 10-14 are listed. Same pagination check as above.
- `bostoncentral`: single-day calendar. Same check as above.

No corrected JSON is given for these, because I found no verified URL.

## Remove

None.
