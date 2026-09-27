status: ok
Fever Boston (feverup.com/en/boston) — ticketed experiences: candlelight concerts, tours, comedy, dining, immersive shows, cruises, food classes.
- Fetch: page (3 listing pages). Build one record per date-range listing.
- City from venue text (Boston or Cambridge only; skip others like Lexington, Fitchburg, Brookline venues).
- date = later of the listing's first date and the window start (2026-09-27); endDate = listing's last date.
- Skip items with no dates and items whose first date is after the window end (2026-10-11).
- Skip gift cards.
- url = feverup.com/m/<id>; venue = text before the title (e.g. Simons Theatre, The Liberty Hotel, 139 Tremont St).
- price = the "From $" amount.
- Category: music for candlelight concerts, food & drink for dining/food classes, arts & theater for shows, family for museums, community for tours.
- Detail fetches used for venues/addresses of ghost tours and the Ballet of Lights show.
