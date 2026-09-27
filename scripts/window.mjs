// Computes the search window from config.json and writes window.json.
// Runs once per run (rigs skip it when window.json exists) so every codon sees the same dates.
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('config.json', 'utf8'));
const iso = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD

const start = new Date();
const end = new Date(start.getTime() + (config.daysAhead ?? 14) * 86400000);

const window = {
  start: iso(start),
  end: iso(end),
  cities: config.cities,
  categories: config.categories,
  minEventsPerCity: config.minEventsPerCity ?? 3,
};
writeFileSync('window.json', JSON.stringify(window, null, 2) + '\n');
console.log(`Window ${window.start} → ${window.end} for ${window.cities.length} cities.`);
