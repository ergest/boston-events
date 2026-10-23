status: ok
Read the ICA Boston events listing (https://www.icaboston.org/events/) as 2 page chunks. 29 records saved in events/ica.json, all in Boston.
Judgment calls:
- Recurring or multi-date events (workshops, family days, free nights, tours) get one record on the first date inside the window; the other dates are listed in the description.
- Multi-day runs (Day of the Dead, Harboring Creativity) use date + endDate.
- Exhibitions on view during the window are included (one record each, dated 2026-10-23, endDate = closing date) because the page lists them under "On view exhibitions".
- Skipped: ICA Gala 2026 (donor/sponsor-driven RSVP event, sponsor tiers and host committee), Member Tour: 90 YEARS & Leilah Babirye (members only), Online Series: Eyes on Art (virtual).
- Listing gives no street address or prices for most events; those fields are omitted rather than guessed. Venue is "ICA Boston" unless the listing names The Watershed.
- ICA Halloween: It's Magic! shows "8 PM–12 AM"; startTime 20:00 is set and endTime omitted.
- MIDDAY Movement Series: Braiding Futures shows "8 PM" despite the name; copied as listed.
- One detail page fetched (ICA Gala) to check whether it was public.
