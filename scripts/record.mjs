// The rules one event record must meet, shared by check.mjs, merge.mjs and flag.mjs.
// recordProblems(e, window) returns a list of problems (empty when the record is valid).
export const REQUIRED = ['title', 'city', 'venue', 'date', 'category', 'url', 'source'];
const OPTIONAL_STRINGS = ['id', 'endDate', 'address', 'startTime', 'endTime', 'price', 'registerUrl', 'description', 'sourceId'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function recordProblems(e, window) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return ['not an object'];
  const problems = [];
  for (const f of REQUIRED) {
    if (typeof e[f] !== 'string' || !e[f].trim()) problems.push(`${f} must be a nonempty string`);
  }
  for (const f of OPTIONAL_STRINGS) {
    if (e[f] !== undefined && typeof e[f] !== 'string') problems.push(`${f} must be a string if present`);
  }
  if (!window.cities.includes(e.city)) problems.push(`city "${e.city}" is not one of: ${window.cities.join(', ')}`);
  if (!window.categories.includes(e.category)) problems.push(`category "${e.category}" is not one of: ${window.categories.join(', ')}`);
  if (!DAY.test(e.date ?? '')) problems.push('date must be YYYY-MM-DD');
  // A run that began before the window (an exhibition) is recorded from the window's first day.
  else if (e.date < window.start || e.date > window.end) problems.push(`date ${e.date} is outside ${window.start}..${window.end}${e.endDate && e.date < window.start ? ` (for a run already on, use ${window.start} and keep endDate)` : ''}`);
  // endDate marks a run (an exhibition, a daily program): on from date through endDate, which may be past the window.
  if (e.endDate !== undefined && (!DAY.test(e.endDate) || e.endDate <= e.date)) problems.push('endDate must be YYYY-MM-DD and after date (omit it for a one-day event)');
  for (const f of ['startTime', 'endTime']) {
    if (e[f] !== undefined && !TIME.test(e[f])) problems.push(`${f} must be 24h HH:MM`);
  }
  if (e.endTime && !e.startTime) problems.push('endTime needs a startTime');
  for (const f of ['url', 'registerUrl']) {
    if (e[f] !== undefined && !/^https?:\/\//.test(e[f])) problems.push(`${f} must start with http(s)://`);
  }
  return problems;
}

// Two records with the same key are duplicates.
export const recordKey = (e) => `${(e.title ?? '').toLowerCase().trim()}|${e.date}|${e.city}`;
