#!/usr/bin/env node
// Simple server-side Maps API key validator (uses Geocoding API)
// Usage: node scripts/validate-maps-key.js <API_KEY>
// or set MAPS_API_KEY env var and run: node scripts/validate-maps-key.js

const https = require('https');
const key = process.argv[2] || process.env.MAPS_API_KEY;

if (!key) {
  console.error('Usage: node scripts/validate-maps-key.js <API_KEY>\nOr set MAPS_API_KEY env var.');
  process.exit(2);
}

const lat = 8.1564;
const lng = 125.1247;
const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;

console.log('Checking Maps API key (Geocoding) — this runs server-side so it ignores HTTP referrer restrictions.');

https.get(url, (res) => {
  let body = '';
  res.on('data', (d) => (body += d));
  res.on('end', () => {
    try {
      const j = JSON.parse(body);
      console.log('HTTP:', res.statusCode);
      console.log('API status:', j.status);
      if (j.error_message) console.log('error_message:', j.error_message);
      if (j.results && j.results.length) console.log('Sample result:', j.results[0].formatted_address);
    } catch (err) {
      console.error('Invalid JSON response');
      console.error(body.substring(0, 1000));
    }
  });
}).on('error', (err) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});
