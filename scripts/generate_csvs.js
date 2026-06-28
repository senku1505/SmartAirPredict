/**
 * generate_csvs.js
 * 
 * Generates synthetic historical CSV records for Wadala, Bandra, and Kalyan
 * based on hourly weather/air-quality anchors to facilitate local model training.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REAL_HOURLY = {
    wadala: {
        temp:     [33.0, 35.0, 36.0, 35.6, 34.8, 34.3, 33.6],
        humidity: [36,   31,   33,   45,   53,   52,   52  ],
        pm25:     [26.5, 28.3, 28.8, 28.4, 28.0, 29.5, 30.7],
        co:       [506,  457,  413,  382,  357,  351,  379 ],
    },
    bandra: {
        temp:     [33.1, 35.2, 36.1, 36.0, 35.4, 34.8, 34.0],
        humidity: [36,   32,   35,   45,   51,   50,   49  ],
        pm25:     [26.5, 28.3, 28.8, 28.4, 28.0, 29.5, 30.7],
        co:       [380,  305,  252,  247,  266,  286,  306 ],
    },
    kalyan: {
        temp:     [33.3, 36.1, 38.5, 40.5, 41.5, 41.8, 42.5],
        humidity: [38,   28,   22,   18,   16,   15,   14  ],
        pm25:     [26.1, 21.8, 20.7, 21.9, 23.0, 24.4, 25.9],
        co:       [331,  270,  224,  208,  208,  211,  210 ],
    },
};

const LOCATION_OFFSET = { wadala: 0, bandra: 50, kalyan: 150 };

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Park-Miller LCG PRNG for reproducible sensor noise simulation
function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function calculateIndianAQI(rawValue, temperature, humidity) {
    const factor = 1.0 + 0.008 * (temperature - 25) + 0.005 * (humidity - 50);
    const adjusted = rawValue / factor;
    const conc = Math.max(0, (adjusted - 200) * 0.11);

    if (conc <= 30)  return Math.round(Math.max(0, Math.min(500, (conc / 30) * 50)));
    if (conc <= 60)  return Math.round(Math.max(0, Math.min(500, 51  + ((conc -  30) /  30) * 49)));
    if (conc <= 90)  return Math.round(Math.max(0, Math.min(500, 101 + ((conc -  60) /  30) * 99)));
    if (conc <= 120) return Math.round(Math.max(0, Math.min(500, 201 + ((conc -  90) /  30) * 99)));
    if (conc <= 250) return Math.round(Math.max(0, Math.min(500, 301 + ((conc - 120) / 130) * 99)));
    return Math.round(Math.max(0, Math.min(500, 401 + ((conc - 250) / 130) * 99)));
}

function generateCSV(locationKey, seed) {
    const rng = rngSeed(seed);
    const real = REAL_HOURLY[locationKey];
    const offset = LOCATION_OFFSET[locationKey];
    const label = locationKey.charAt(0).toUpperCase() + locationKey.slice(1);

    const rows = ['Location,Reading #,Timestamp,Air Quality (Raw MQ135),AQI (Indian Std),Temperature (C),Humidity (%)'];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);

    for (let i = 0; i < 60; i++) {
        const elapsed = i * 60;
        const ts = new Date(start.getTime() + elapsed * 1000);
        const hourFrac = elapsed / 3600;

        const baseTemp = lerp(real.temp[0], real.temp[1], hourFrac);
        const baseHumidity = lerp(real.humidity[0], real.humidity[1], hourFrac);
        const baseCO = lerp(real.co[0], real.co[1], hourFrac);
        const basePM25 = lerp(real.pm25[0], real.pm25[1], hourFrac);

        const temp = baseTemp + (rng() - 0.5) * 0.6;
        const humidity = Math.max(8, Math.min(99, baseHumidity + (rng() - 0.5) * 3.0));

        // Generate synthetic MQ135 reading matching the carbon monoxide and PM2.5 profiles
        let mq135 = (baseCO * 1.2) + (basePM25 * 5.0) + offset + (rng() - 0.5) * 40;
        if (rng() > 0.97) mq135 += 60 + rng() * 100;
        mq135 = Math.max(150, Math.min(3500, Math.round(mq135)));

        const aqi = calculateIndianAQI(mq135, temp, humidity);
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

function rngSeed(seed) {
    let s = seed;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

const OUTPUT_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const LOCATIONS = [
    { key: 'wadala', seed: 42069 },
    { key: 'bandra', seed: 31415 },
    { key: 'kalyan', seed: 27182 },
];

for (const { key, seed } of LOCATIONS) {
    const csv = generateCSV(key, seed);
    const outPath = path.join(OUTPUT_DIR, `historical_data_${key}.csv`);
    fs.writeFileSync(outPath, csv);
    console.log(`Generated ${key} data.`);
}
