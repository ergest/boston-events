// Wraps events.json as events.js so app/index.html can load it from file:// without a server.
import { readFileSync, writeFileSync } from 'node:fs';

const window = JSON.parse(readFileSync('window.json', 'utf8'));
const events = JSON.parse(readFileSync('events.json', 'utf8'));
const payload = { generatedAt: new Date().toISOString(), window, events };

writeFileSync('events.js', `window.EVENTS_DATA = ${JSON.stringify(payload, null, 2)};\n`);
console.log(`Wrote events.js with ${events.length} events.`);
