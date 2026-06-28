/**
 * generate_csvs.js
 * ─────────────────────────────────────────────────────────────────────────
 * Generates synthetic-but-realistic historical CSV data for the three
 * monitoring locations (Wadala, Bandra, Kalyan). Used for local development
 * and ML training when you don't have a live ESP32 connected.
 *
 * The data is anchored to real Open-Meteo API readings from April 23, 2026
 * (9 AM – 3 PM) and adds sensor-realistic noise on top.
 *
 * Usage:
 *   node scripts/generate_csvs.js
 *
 * Output files (written to project root):
 *   data/historical_data_wadala.csv
 *   data/historical_data_bandra.csv
 *   data/historical_data_kalyan.csv
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Real hourly anchor data from Open-Meteo (hours 9–15) ──────────────────
// Source: api.open-meteo.com + air-quality-api.open-meteo.com (April 23 2026)
const REAL_HOURLY = {
    wadala: {
        // Coords: 19.0178, 72.8575
        temp:     [33.0, 35.0, 36.0, 35.6, 34.8, 34.3, 33.6],
        humidity: [36,   31,   33,   45,   53,   52,   52  ],
        pm25:     [26.5, 28.3, 28.8, 28.4, 28.0, 29.5, 30.7],
        co:       [506,  457,  413,  382,  357,  351,  379 ],
    },
    bandra: {
        // Coords: 19.0544, 72.8264
        temp:     [33.1, 35.2, 36.1, 36.0, 35.4, 34.8, 34.0],
        humidity: [36,   32,   35,   45,   51,   50,   49  ],
        pm25:     [26.5, 28.3, 28.8, 28.4, 28.0, 29.5, 30.7],
        co:       [380,  305,  252,  247,  266,  286,  306 ],
    },
    kalyan: {
        // Coords: 19.2437, 73.1355
        temp:     [33.3, 36.1, 38.5, 40.5, 41.5, 41.8, 42.5],
        humidity: [38,   28,   22,   18,   16,   15,   14  ],
        pm25:     [26.1, 21.8, 20.7, 21.9, 23.0, 24.4, 25.9],
        co:       [331,  270,  224,  208,  208,  211,  210 ],
    },
};

// Calibration offsets to match real IQAir/CPCB AQI readings for each area
const LOCATION_OFFSET = {
    wadala: 0,    // Baseline (target AQI ~100–115)
    bandra: 50,   // Slightly elevated from traffic (target AQI ~85–95)
    kalyan: 150,  // Industrial area (target AQI ~120–140)
};

// ── Utilities ───────────────────────────────────────────────────────────────

/** Linear interpolation between a and b at fraction t (0–1). */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Simple seeded PRNG (Park-Miller LCG).
 * Returns a function that gives reproducible floats in [0, 1).
 */
function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/**
 * Converts a raw MQ135 ADC reading to Indian NAQI (CPCB) AQI.
 * Matches the identical logic in app.js and ml_model.py.
 */
function calculateIndianAQI(rawValue, temperature, humidity) {
    const factor = 1.0 + 0.008 * (temperature - 25) + 0.005 * (humidity - 50);
    const adjusted = rawValue / factor;
    const conc = Math.max(0, (adjusted - 200) * 0.11); // → PM2.5 µg/m³ equivalent

    // CPCB PM2.5 breakpoints
    if (conc <= 30)  return Math.round(Math.max(0, Math.min(500, (conc / 30) * 50)));
    if (conc <= 60)  return Math.round(Math.max(0, Math.min(500, 51  + ((conc -  30) /  30) * 49)));
    if (conc <= 90)  return Math.round(Math.max(0, Math.min(500, 101 + ((conc -  60) /  30) * 99)));
    if (conc <= 120) return Math.round(Math.max(0, Math.min(500, 201 + ((conc -  90) /  30) * 99)));
    if (conc <= 250) return Math.round(Math.max(0, Math.min(500, 301 + ((conc - 120) / 130) * 99)));
    return Math.round(Math.max(0, Math.min(500, 401 + ((conc - 250) / 130) * 99)));
}

// ── CSV generation ───────────────────────────────────────────────────────────

/**
 * Generates 60 one-minute readings for the given location, simulating one
 * hour of ESP32 sensor output (9:00 AM – 9:59 AM).
 *
 * @param {string} locationKey  - 'wadala' | 'bandra' | 'kalyan'
 * @param {number} seed         - Seed for the PRNG (keeps data reproducible)
 * @returns {string}            - CSV text including header row
 */
function generateCSV(locationKey, seed) {
    const rng    = seededRandom(seed);
    const real   = REAL_HOURLY[locationKey];
    const offset = LOCATION_OFFSET[locationKey];
    const label  = locationKey.charAt(0).toUpperCase() + locationKey.slice(1);

    const rows = ['Location,Reading #,Timestamp,Air Quality (Raw MQ135),AQI (Indian Std),Temperature (C),Humidity (%)'];

    // Recording window: today at 9:00 AM, one reading per minute for 60 minutes
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);

    for (let i = 0; i < 60; i++) {
        const elapsed   = i * 60;                               // seconds from 9:00 AM
        const ts        = new Date(start.getTime() + elapsed * 1000);
        const hourFrac  = elapsed / 3600;                        // 0.0 → 1.0 over the hour

        // Interpolate between hour 9 and hour 10 anchor values
        const baseTemp     = lerp(real.temp[0],     real.temp[1],     hourFrac);
        const baseHumidity = lerp(real.humidity[0], real.humidity[1], hourFrac);
        const baseCO       = lerp(real.co[0],       real.co[1],       hourFrac);
        const basePM25     = lerp(real.pm25[0],     real.pm25[1],     hourFrac);

        // Add DHT22-like sensor noise (±0.3 °C, ±1.5% RH)
        const temp     = baseTemp + (rng() - 0.5) * 0.6;
        const humidity = Math.max(8, Math.min(99, baseHumidity + (rng() - 0.5) * 3.0));

        // Derive a plausible MQ135 raw reading from CO concentration + PM2.5
        let mq135 = (baseCO * 1.2) + (basePM25 * 5.0) + offset + (rng() - 0.5) * 40;

        // Occasional short pollution spike (traffic, local events — ~3% chance)
        if (rng() > 0.97) mq135 += 60 + rng() * 100;

        mq135 = Math.max(150, Math.min(3500, Math.round(mq135)));

        const aqi     = calculateIndianAQI(mq135, temp, humidity);
        const timeStr = ts.toLocaleTimeString('en-IN', {
            hour:   '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });

        rows.push(`${label},${i + 1},${timeStr},${mq135},${aqi},${temp.toFixed(1)},${humidity.toFixed(1)}`);
    }

    return rows.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const LOCATIONS = [
    { key: 'wadala', seed: 42069 },
    { key: 'bandra', seed: 31415 },
    { key: 'kalyan', seed: 27182 },
];

console.log('Generating CSV files...\n');

for (const { key, seed } of LOCATIONS) {
    const csv      = generateCSV(key, seed);
    const outPath  = path.join(OUTPUT_DIR, `historical_data_${key}.csv`);
    fs.writeFileSync(outPath, csv);

    // Quick summary so you can sanity-check the output
    const aqis   = csv.split('\n').slice(1).map(row => parseInt(row.split(',')[4], 10));
    const avg    = Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length);
    const peak   = Math.max(...aqis);
    const min    = Math.min(...aqis);

    console.log(`✅ ${key}: ${aqis.length} readings — avg AQI ${avg}, peak ${peak}, min ${min}`);
    console.log(`   → ${outPath}\n`);
}

console.log('Done. CSVs are ready for local testing or ML training.');
