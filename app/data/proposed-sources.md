# Proposed Source Registry Changes

## Summary

Coverage is strong in Boston/Cambridge but four small cities are at or below the `minEventsPerCity` target of 3: Watertown (0), Waltham (1), Malden (1), and Dedham (0), plus Quincy (3, only 1 festival). The most important change is fixing the Cambridge City calendar, which currently yields 0 events because its week-view pages only render under a headless browser; it publishes a full ICS feed at `/citycalendar.ics` that covers the whole window (1,700+ events). I also add two new sources that directly fill the empty/short cities: Malden Events (Malden, ~15 public events) and Discover Quincy (Quincy, several in-window events). Watertown, Waltham, and Dedham civic sites were unreachable through the fetch rig (HTTP 000/403) and no alternative aggregator was confirmed, so no proposal is made for them. BU Spark is thin but legitimate and kept as-is.

## Add

### Malden Events — fills Malden (currently 1 event, below target). A public events calendar for the city with a stable listing page and ~15 events, several inside the window (recurring Malden Farmers Market, leaf-peeping hikes, outdoor art class, trivia, bowling, theater). Not an ICS feed (the `/rss/` page is a placeholder), so fetch as a page.

```json
{ "id": "malden-events", "name": "Malden Events", "type": "local", "fetch": "page", "urls": ["https://www.maldenevents.com/"], "cities": ["Malden"], "notes": "Public events calendar for Malden. Fetch the home listing; each event links to a /2026/<slug> detail page. Keep in-person public events (markets, hikes, family, arts, food); skip high-school sports and members-only/promo items. No street address on the listing — fill in from detail pages where shown." }
```

### Discover Quincy — fills/fortifies Quincy (currently 3 events, only 1 in festivals & markets). A tourism/events site with clear event detail pages inside the window (Eustis Estate Fine Arts & Crafts Market Oct 27, Food Truck & Music Festival, Quincy Spiritualist Psychic Fair Oct 10). Fetch as a page.

```json
{ "id": "discover-quincy", "name": "Discover Quincy", "type": "local", "fetch": "page", "urls": ["https://discoverquincy.com/events/"], "cities": ["Quincy"], "defaultCategory": "festivals & markets", "notes": "Quincy events and festivals. Link each event to its detail page (e.g. /events/<slug> or the venue's own page). Keep public in-person events; skip recurring monthly programs with no pinned date and religious-only events unless public and general-interest." }
```

## Fix

### cambridge-city
What's wrong: status `thin` because the configured week-view URLs (`citycalendar?start=...&view=Week`) only render events under a headless browser; the fetch rig returns the JS calendar shell with no listings (0 events). The City of Cambridge publishes a full ICS feed at `/citycalendar.ics` that covers the entire window (1,700+ events), which is far more reliable than the week-view pages. Switch to `fetch: "ics"` and drop the week-view URLs. Keep the existing exclude notes (skip board/commission meetings and hearings).

```json
{ "id": "cambridge-city", "name": "City of Cambridge calendar", "type": "civic", "fetch": "ics", "urls": ["https://www.cambridgema.gov/citycalendar.ics"], "cities": ["Cambridge"], "defaultCategory": "community", "notes": "ICS feed behind the city calendar. Skip board/commission meetings and hearings. Note: the old week-view page URLs only render under a headless browser, so they were replaced by this feed.", "trimParagraphs": 150 }
```

## Remove

(none)

## Notes / judgment calls

- **bu-spark** is `thin` (only one in-window event, Code & Tell, Oct 7) but it is a legitimate, reachable source; thinness here is a function of the narrow window, not a broken or moved site. Kept unchanged. If thinness persists, the discover step could look for BU CDS/faculty events feeds.
- **Watertown, Waltham, Dedham**: the official city events pages return HTTP 000 (blocked/unreachable through the fetch rig) and one returns 403. Alternative domains (cityofwaltham.com) are parked/scam domains. No candidate-sources were provided by the discover step, so I did not invent sites. These three cities remain uncovered; a future run with working civic-site access or discovered local-event aggregators may be able to fill them.
- Malden Events and Discover Quincy were confirmed by opening their pages with `node page.mjs`; both render their listing/event pages without requiring interaction.
