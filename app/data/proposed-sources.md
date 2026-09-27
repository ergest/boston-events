# Proposed Sources

Window 2026-09-27 → 2026-10-11. Target: ≥3 events per city.

## Summary

Boston is well covered (215 events); the structural problem is the 6 smallest towns —
Watertown (1), Waltham (2), Arlington (1), Malden (1), Quincy (1), Dedham (2) — which have
no dedicated source and sit below `minEventsPerCity` of 3. Two university sources are
**broken** because their event pages are JavaScript-rendered shells that the fetcher can't
read: `brandeis` and `tufts`. Several venues are **thin** (MFA lists no public events;
Brighton Music Hall's TicketMaster pages hit a reCAPTCHA; Bostancentral hides dates behind
detail pages). Firecrawl budget (5) was spent trying to reach town calendars for the gap
cities; the Quincy library domain and Arlington MA town-lib did not resolve, and the final
network hop failed, so I could not confirm new town sources this run. Proposals below are
based on analysis; the two town-calendar additions are unverified and should be firecrawl-confirmed.

## Add

### 1. Public Library of Arlington (Arlington, MA) — fills Arlington gap (1 event)
Arlington's public library (Arlington Public Library, 53 Arlington Center) runs frequent
public programming (storytimes, author talks, book clubs, seasonal markets) that would fill
the Arlington gap. Prefer an ICS feed if the libcal calendar exposes one; otherwise `page`.
**Unverified this run** — the library domain did not resolve through firecrawl; confirm the
events URL and fetch before adding.

```json
{ "id": "arlington-library", "name": "Arlington Public Library", "type": "civic", "fetch": "page", "urls": ["https://www.arlingtonlibrary.org/events/"], "cities": ["Arlington"], "defaultCategory": "community" }
```

### 2. City of Quincy events calendar — fills Quincy gap (1 event)
Quincy's municipal events page (or Quincy Public Libraries) should carry community, arts,
and family events in-window. The library domain (quincypubliclibraries.org) did not resolve
through firecrawl this run; the `quincy.ma.gov` domain also failed DNS. **Unverified** —
confirm which domain is live and scrape its events listing before adding.

```json
{ "id": "quincy-gov", "name": "City of Quincy events", "type": "civic", "fetch": "page", "urls": ["https://www.quincy.ma.gov/events"], "cities": ["Quincy"], "defaultCategory": "community" }
```

## Fix

### brandeis — broken (JavaScript-rendered shell)
`https://www.brandeis.edu/events/` returns only the static HTML shell ("Brandeis Campus
Calendar", "Find Events") with no listings; events load via JS the fetcher cannot execute.
Tried `/events/` and `/events/index.html`; same result. No records were written.

**Option A — investigate an ICS feed** (preferred; MIT/Northeastern work via `.ics`). Try
`https://www.brandeis.edu/calendar/events/.ics` or look for a "Subscribe"/"Add to calendar"
link on the events page. If found, switch `fetch` to `ics`:

```json
{ "id": "brandeis", "name": "Brandeis events", "type": "university", "fetch": "ics", "urls": ["REPLACE_WITH_CONFIRMED_ICS_URL"], "cities": ["Waltham"], "defaultCategory": "tech & talks", "notes": "Keep only events open to the public. Confirm feed URL before adding." }
```

**Option B — if no feed and the page stays JS-only, remove it** (see Remove).

### tufts — broken (JavaScript-rendered shell)
`https://events.tufts.edu/` returned only nav links and a "Featured Events" section
(Admissions & Visits, Submit an Event); the raw fetch was empty. The event list is JS-loaded.
Tufts covers Medford + Somerville + Boston.

**Option A — find an ICS/RSS feed.** Check events.tufts.edu for a "Subscribe"/"RSS"/"iCal"
link; Tufts often exposes ICS per category. If found:

```json
{ "id": "tufts", "name": "Tufts events", "type": "university", "fetch": "ics", "urls": ["REPLACE_WITH_CONFIRMED_ICS_URL"], "cities": ["Medford", "Somerville", "Boston"], "defaultCategory": "tech & talks", "notes": "Keep only events open to the public. Confirm feed URL before adding." }
```

**Option B — if no feed, remove it** (see Remove). If Tufts is removed, Medford loses its
only source (currently 3 events, at the threshold) — prioritize a Medford town calendar or
Medford library as an Add before dropping Tufts.

### mfa — thin (no public events on the /events page)
`https://www.mfa.org/events` currently lists only general-admission and exhibition-entry
tickets, not public programs, so nothing qualified. The MFA does run public events
(lectures, family days, concerts) — they may be under a different URL (e.g. `/visit/calendar`
or `/programs`). Confirm the public-events listing URL; if the `/events` page only sells
tickets, switch to the calendar/events URL rather than keeping the current one.

```json
{ "id": "mfa", "name": "Museum of Fine Arts", "type": "venue", "fetch": "json", "urls": ["CONFIRMED_PUBLIC_EVENTS_URL"], "cities": ["Boston"], "defaultCategory": "arts & theater" }
```

### brighton-music-hall — thin (TicketMaster reCAPTCHA blocks detail fetches)
3 events recorded with valid TicketMaster URLs; every other in-window show (Oct 1–11) has a
date/time in the listing but no groundable event-page URL, and TicketMaster pages return a
reCAPTCHA. The listing widget on crossroadspresents.com only exposes the first 4 upcoming
events. Try the venue's own listing or a TicketMaster RSS/ICS if available; otherwise this
source is capped at ~3 events and is acceptable but thin. No change required unless a cleaner
URL/feed is found.

## Remove

### tufts — if no ICS feed is found and the page stays JS-only
`events.tufts.edu` is a JS-rendered shell; no events could be extracted this run, and its
Medford/Somerville/Boston coverage is currently carried by Tufts alone for Medford. **Only
remove after confirming a Medford source exists** (Medford library or town calendar), else
Medford drops below 3.

### brandeis — if no ICS feed is found and the page stays JS-only
`brandeis.edu/events/` is a JS-rendered shell. Waltham currently has 2 events (from
boston-calendar/eventbrite); Brandeis is its only Waltham-specific academic source. **Only
remove if a Waltham source (city calendar, library, or a Waltham venue) can fill the gap**,
else Waltham drops below 3.
