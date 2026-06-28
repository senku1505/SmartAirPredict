function seededRandom(seed) {
    let s = seed;
    return function () { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}
function lerp(a, b, t) { return a + (b - a) * t; }
const REAL_HOURLY = {
    wadala: { temp: [33.0,35.0,36.0,35.6,34.8,34.3,33.6], humidity: [36,31,33,45,53,52,52], pm25: [26.5,28.3,28.8,28.4,28.0,29.5,30.7], co: [506,457,413,382,357,351,379] },
    bandra: { temp: [33.1,35.2,36.1,36.0,35.4,34.8,34.0], humidity: [36,32,35,45,51,50,49], pm25: [26.5,28.3,28.8,28.4,28.0,29.5,30.7], co: [380,305,252,247,266,286,306] },
    kalyan: { temp: [33.3,36.1,38.5,40.5,41.5,41.8,42.5], humidity: [38,28,22,18,16,15,14], pm25: [26.1,21.8,20.7,21.9,23.0,24.4,25.9], co: [331,270,224,208,208,211,210] }
};
const OFFSET = { wadala: 0, bandra: 50, kalyan: 150 };
function calculateIndianAQI(rawValue, temperature, humidity) {
    const factor = 1.0 + 0.008*(temperature-25) + 0.005*(humidity-50);
    const adj = rawValue / factor;
    const conc = Math.max(0, (adj - 200) * 0.11);
    let aqi;
    if (conc <= 30) aqi = (conc/30)*50;
    else if (conc <= 60) aqi = 51+((conc-30)/30)*49;
    else if (conc <= 90) aqi = 101+((conc-60)/30)*99;
    else if (conc <= 120) aqi = 201+((conc-90)/30)*99;
    else if (conc <= 250) aqi = 301+((conc-120)/130)*99;
    else aqi = 401+((conc-250)/130)*99;
    return Math.max(0, Math.min(500, Math.round(aqi)));
}
function generateCSV(loc, seed) {
    const rng = seededRandom(seed); const real = REAL_HOURLY[loc]; const offset = OFFSET[loc];
    const rows = ['Location,Reading #,Timestamp,Air Quality (Raw MQ135),AQI (Indian Std),Temperature (C),Humidity (%)'];
    const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
    for (let i = 0; i < 60; i++) {
        const elapsed = i * 60; const ts = new Date(start.getTime() + elapsed * 1000); const frac = elapsed / 3600;
        const temp = lerp(real.temp[0], real.temp[1], frac) + (rng()-0.5)*0.6;
        const humidity = Math.max(8, Math.min(99, lerp(real.humidity[0], real.humidity[1], frac) + (rng()-0.5)*3.0));
        let mq135 = (lerp(real.co[0], real.co[1], frac)*1.2) + (lerp(real.pm25[0], real.pm25[1], frac)*5.0) + offset + (rng()-0.5)*40;
        mq135 = Math.max(150, Math.min(3500, mq135));
        if (rng() > 0.97) mq135 += 60 + rng() * 100;
        const rawAQ = Math.round(mq135); const calcAQI = calculateIndianAQI(rawAQ, temp, humidity);
        const name = loc.charAt(0).toUpperCase() + loc.slice(1);
        const timeStr = ts.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
        rows.push(`${name},${i+1},${timeStr},${rawAQ},${calcAQI},${temp.toFixed(1)},${humidity.toFixed(1)}`);
    }
    return rows.join('\n');
}
const fs = require('fs');
[['wadala',42069],['bandra',31415],['kalyan',27182]].forEach(([loc,seed]) => {
    const csv = generateCSV(loc, seed); fs.writeFileSync(`historical_data_${loc}.csv`, csv);
    const lines = csv.split('\n'); const aqis = lines.slice(1).map(l => parseInt(l.split(',')[4]));
    console.log(`${loc}: Avg=${Math.round(aqis.reduce((a,b)=>a+b,0)/aqis.length)}, Peak=${Math.max(...aqis)}, Min=${Math.min(...aqis)}`);
});
