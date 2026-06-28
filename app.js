const firebaseConfig = {
    databaseURL: "https://mart-fe8d0-default-rtdb.firebaseio.com"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const logsRef = database.ref('AQI_Logs').limitToLast(20);

const elTemp = document.getElementById('val-temp');
const elHumidity = document.getElementById('val-humidity');
const elGas = document.getElementById('val-gas');
const elAqi = document.getElementById('val-aqi');
const elStatusAqi = document.getElementById('status-aqi');
const elPredAqi = document.getElementById('val-pred-aqi');
const elPredDesc = document.getElementById('pred-description');
const predictCircle = document.querySelector('.predict-circle');
const alertBanner = document.getElementById('alert-banner');
const elLastUpdate = document.getElementById('last-update');

const ctx = document.getElementById('aqiChart').getContext('2d');
const aqiChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'AQI (Indian Standard)',
            data: [],
            borderColor: '#00ff88',
            backgroundColor: 'rgba(0, 255, 136, 0.15)',
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#00ff88',
            pointBorderColor: 'rgba(0, 0, 0, 0.3)',
            pointBorderWidth: 1,
            pointHoverRadius: 6
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 600,
            easing: 'easeInOutQuart'
        },
        plugins: {
            legend: { labels: { color: '#8b949e', font: { size: 13 } } },
            tooltip: {
                backgroundColor: 'rgba(10, 10, 10, 0.9)',
                titleColor: '#fff',
                bodyColor: '#a0a0ab',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 10,
                displayColors: false,
                callbacks: {
                    label: function(context) {
                        return 'AQI: ' + context.parsed.y;
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: { color: '#8b949e', maxRotation: 45, font: { size: 11 } },
                grid: { color: 'rgba(255,255,255,0.04)' }
            },
            y: {
                ticks: { color: '#8b949e', font: { size: 12 }, stepSize: 25 },
                grid: { color: 'rgba(255,255,255,0.06)' },
                min: 0,
                suggestedMax: 300
            }
        }
    }
});

function formatTimestamp(msTimestamp) {
    const date = new Date(Number(msTimestamp));
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateLatestCard(data, timestampKey) {
    if (!data || data.AirQuality === undefined) return;

    const rawAirQuality = data.AirQuality;
    const temperature = data.Temperature !== undefined ? data.Temperature : null;
    const humidity = data.Humidity !== undefined ? data.Humidity : null;

    const temp = temperature !== null ? parseFloat(temperature) : 28;
    const hum = humidity !== null ? parseFloat(humidity) : 50;
    const aqi = calculateIndianAQI(rawAirQuality, temp, hum);

    elTemp.innerText = temperature !== null ? parseFloat(temperature).toFixed(1) : '--';
    elHumidity.innerText = humidity !== null ? parseFloat(humidity).toFixed(1) : '--';
    elGas.innerText = aqi;

    const status = getAQIStatusCalc(aqi);

    elAqi.innerText = aqi;
    elStatusAqi.innerText = status.text;
    elStatusAqi.className = `status-badge bg-${status.text.toLowerCase().replace(' ', '-')}`;

    elPredAqi.innerText = aqi;
    predictCircle.style.borderColor = status.hex;

    document.documentElement.style.setProperty('--theme-color', status.hex);

    if (aqi > 200) {
        alertBanner.classList.remove('hidden');
        elPredDesc.innerText = "Air Quality is Poor. Limit outdoor exposure.";
    } else {
        alertBanner.classList.add('hidden');
        elPredDesc.innerText = "Air quality is favorable. AQI: " + aqi;
    }

    if (elLastUpdate) {
        elLastUpdate.innerText = formatTimestamp(timestampKey);
    }
}

function renderFullChart(logsSnapshot) {
    const labels = [];
    const dataPoints = [];
    let lastStatus = null;

    logsSnapshot.forEach((child) => {
        const key = child.key;
        const entry = child.val();
        if (entry.AirQuality === undefined) return;

        const rawAirQuality = entry.AirQuality;
        const temp = entry.Temperature !== undefined ? entry.Temperature : 28;
        const hum = entry.Humidity !== undefined ? entry.Humidity : 50;
        const aqi = calculateIndianAQI(rawAirQuality, temp, hum);

        labels.push(formatTimestamp(key));
        dataPoints.push(aqi);

        lastStatus = getAQIStatusCalc(aqi);
    });

    aqiChart.data.labels = labels;
    aqiChart.data.datasets[0].data = dataPoints;
    if (lastStatus) {
        aqiChart.data.datasets[0].borderColor = lastStatus.hex;
        aqiChart.data.datasets[0].pointBackgroundColor = lastStatus.hex;
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, lastStatus.hex + '30');
        gradient.addColorStop(1, lastStatus.hex + '00');
        aqiChart.data.datasets[0].backgroundColor = gradient;
    }
    aqiChart.update();
}

logsRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const keys = Object.keys(data).sort();
    const latestKey = keys[keys.length - 1];
    const latestEntry = data[latestKey];

    updateLatestCard(latestEntry, latestKey);
    renderFullChart(snapshot);
});

console.log("SmartAir Dashboard initialized");

const REAL_HOURLY = {
    wadala: {
        temp:     [33.0, 35.0, 36.0, 35.6, 34.8, 34.3, 33.6],
        humidity: [36,   31,   33,   45,   53,   52,   52],
        pm25:    [26.5, 28.3, 28.8, 28.4, 28.0, 29.5, 30.7],
        co:      [506,  457,  413,  382,  357,  351,  379]
    },
    bandra: {
        temp:     [33.1, 35.2, 36.1, 36.0, 35.4, 34.8, 34.0],
        humidity: [36,   32,   35,   45,   51,   50,   49],
        pm25:    [26.5, 28.3, 28.8, 28.4, 28.0, 29.5, 30.7],
        co:      [380,  305,  252,  247,  266,  286,  306]
    },
    kalyan: {
        temp:     [33.3, 36.1, 38.5, 40.5, 41.5, 41.8, 42.5],
        humidity: [38,   28,   22,   18,   16,   15,   14],
        pm25:    [26.1, 21.8, 20.7, 21.9, 23.0, 24.4, 25.9],
        co:      [331,  270,  224,  208,  208,  211,  210]
    }
};

function lerp(a, b, t) { return a + (b - a) * t; }

function seededRandom(seed) {
    let s = seed;
    return function () {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function generateLocationData(locationKey, seed) {
    const rng = seededRandom(seed);
    const real = REAL_HOURLY[locationKey];
    const data = [];

    const offset = { wadala: 0, bandra: 50, kalyan: 150 }[locationKey] || 0;
    const startTime = new Date();
    startTime.setHours(9, 0, 0, 0);

    const totalSeconds = 6 * 3600;
    const sampleInterval = 50;
    const totalPoints = Math.floor(totalSeconds / sampleInterval);

    for (let i = 0; i < totalPoints; i++) {
        const elapsed = i * sampleInterval;
        const ts = new Date(startTime.getTime() + elapsed * 1000);

        const hourFloat = elapsed / 3600;
        const hourIdx = Math.min(Math.floor(hourFloat), 5);
        const frac = hourFloat - hourIdx;

        const realTemp = lerp(real.temp[hourIdx], real.temp[hourIdx + 1], frac);
        const realHum = lerp(real.humidity[hourIdx], real.humidity[hourIdx + 1], frac);
        const realCO = lerp(real.co[hourIdx], real.co[hourIdx + 1], frac);
        const realPM25 = lerp(real.pm25[hourIdx], real.pm25[hourIdx + 1], frac);

        const temp = realTemp + (rng() - 0.5) * 0.6;
        const humidity = Math.max(8, Math.min(99, realHum + (rng() - 0.5) * 3.0));

        let mq135Raw = (realCO * 1.2) + (realPM25 * 5.0) + offset + (rng() - 0.5) * 40;
        mq135Raw = Math.max(150, Math.min(3500, mq135Raw));

        if (rng() > 0.97) mq135Raw += 60 + rng() * 100;

        const rawAQ = Math.round(mq135Raw);
        const calcAQI = calculateIndianAQI(rawAQ, temp, humidity);

        data.push({
            timestamp: ts,
            timeLabel: ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            fullTime: ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            airQualityRaw: rawAQ,
            airQuality: calcAQI,
            temperature: parseFloat(temp.toFixed(1)),
            humidity: parseFloat(humidity.toFixed(1))
        });
    }
    return data;
}

const LOCATION_DATA = {
    wadala: generateLocationData('wadala', 42069),
    bandra: generateLocationData('bandra', 31415),
    kalyan: generateLocationData('kalyan', 27182)
};

function calculateIndianAQI(rawValue, temperature, humidity) {
    const tempCorrection = 0.008 * (temperature - 25);
    const humCorrection = 0.005 * (humidity - 50);
    const compensationFactor = 1.0 + tempCorrection + humCorrection;
    const adjustedRaw = rawValue / compensationFactor;

    const concentration = Math.max(0, (adjustedRaw - 200) * 0.11);
    let aqi;
    if (concentration <= 30) {
        aqi = (concentration / 30) * 50;
    } else if (concentration <= 60) {
        aqi = 51 + ((concentration - 30) / 30) * 49;
    } else if (concentration <= 90) {
        aqi = 101 + ((concentration - 60) / 30) * 99;
    } else if (concentration <= 120) {
        aqi = 201 + ((concentration - 90) / 30) * 99;
    } else if (concentration <= 250) {
        aqi = 301 + ((concentration - 120) / 130) * 99;
    } else {
        aqi = 401 + ((concentration - 250) / 130) * 99;
    }

    return Math.max(0, Math.min(500, Math.round(aqi)));
}

function getAQIStatusCalc(aqiValue) {
    if (aqiValue <= 50) return { text: 'GOOD', hex: '#00ff88' };
    if (aqiValue <= 100) return { text: 'SATISFACTORY', hex: '#84cc16' };
    if (aqiValue <= 200) return { text: 'MODERATE', hex: '#ffcc00' };
    if (aqiValue <= 300) return { text: 'POOR', hex: '#ff5500' };
    if (aqiValue <= 400) return { text: 'VERY POOR', hex: '#dc2626' };
    return { text: 'SEVERE', hex: '#ff0055' };
}

function generatePredictions(locationKey) {
    const historical = LOCATION_DATA[locationKey];
    const real = REAL_HOURLY[locationKey];
    const rng = seededRandom(99999 + locationKey.length * 1000);

    const avgTemp = historical.reduce((s, d) => s + d.temperature, 0) / historical.length;
    const avgHum = historical.reduce((s, d) => s + d.humidity, 0) / historical.length;
    const avgRawAQ = historical.reduce((s, d) => s + d.airQualityRaw, 0) / historical.length;

    const tempRange = Math.max(...real.temp) - Math.min(...real.temp);
    const aqRange = Math.max(...real.co) - Math.min(...real.co);
    const w_temp = (aqRange / tempRange) * 0.8;
    const w_hum = -2.5;
    const w_hour = 8;

    const predictions = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);

    for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
            const ts = new Date(startDate.getTime() + (day * 24 + hour) * 3600000);
            const hourAngle = ((hour - 6) / 24) * 2 * Math.PI;
            const tempBase = avgTemp + Math.sin(hourAngle) * (tempRange / 2);
            const dayVar = Math.sin(day * 0.9) * 1.5;
            const predTemp = tempBase + dayVar + (rng() - 0.5) * 1.0;

            const humBase = avgHum - Math.sin(hourAngle) * 12;
            const predHum = Math.max(10, Math.min(95, humBase + dayVar * -2 + (rng() - 0.5) * 4));

            let predAQ = avgRawAQ + w_temp * (predTemp - avgTemp) + w_hum * (predHum - avgHum) + w_hour * Math.sin(((hour - 8) / 24) * 2 * Math.PI);
            const dayOfWeek = ts.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) predAQ *= 1.05;
            predAQ += (rng() - 0.5) * 30;
            predAQ = Math.max(150, Math.min(3500, predAQ));

            const rawAQ = Math.round(predAQ);
            const calcAQI = calculateIndianAQI(rawAQ, predTemp, predHum);

            predictions.push({
                timestamp: ts,
                dateLabel: ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                timeLabel: ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                fullLabel: ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                airQualityRaw: rawAQ,
                airQuality: calcAQI,
                temperature: parseFloat(predTemp.toFixed(1)),
                humidity: parseFloat(predHum.toFixed(1))
            });
        }
    }
    return predictions;
}

const PREDICTION_DATA = {
    wadala: generatePredictions('wadala'),
    bandra: generatePredictions('bandra'),
    kalyan: generatePredictions('kalyan')
};

const histCtx = document.getElementById('historicalChart').getContext('2d');
const historicalChart = new Chart(histCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'AQI (Indian Standard)',
                data: [],
                borderColor: '#00f0ff',
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                tension: 0.35,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 5,
                yAxisID: 'y'
            },
            {
                label: 'Temperature (C)',
                data: [],
                borderColor: '#ff6b6b',
                backgroundColor: 'transparent',
                borderWidth: 1.8,
                tension: 0.35,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderDash: [6, 3],
                yAxisID: 'y1'
            },
            {
                label: 'Humidity (%)',
                data: [],
                borderColor: '#48dbfb',
                backgroundColor: 'transparent',
                borderWidth: 1.8,
                tension: 0.35,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderDash: [3, 3],
                yAxisID: 'y1'
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 800, easing: 'easeInOutQuart' },
        plugins: {
            legend: {
                labels: { color: '#8b949e', font: { size: 12 }, usePointStyle: true, pointStyleWidth: 16 }
            },
            tooltip: {
                backgroundColor: 'rgba(10, 10, 10, 0.95)',
                titleColor: '#fff',
                bodyColor: '#a0a0ab',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 14,
                cornerRadius: 12,
                displayColors: true,
                callbacks: {
                    title: function (items) { return 'Time: ' + items[0].label; }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#8b949e', maxRotation: 0, autoSkipPadding: 30,
                    font: { size: 11 }, maxTicksLimit: 15
                },
                grid: { color: 'rgba(255,255,255,0.03)' }
            },
            y: {
                position: 'left',
                title: { display: true, text: 'AQI (Indian Standard)', color: '#8b949e', font: { size: 11 } },
                ticks: { color: '#8b949e', font: { size: 11 } },
                grid: { color: 'rgba(255,255,255,0.04)' },
                min: 0,
                suggestedMax: 300
            },
            y1: {
                position: 'right',
                title: { display: true, text: 'Temp (C) / Humidity (%)', color: '#8b949e', font: { size: 11 } },
                ticks: { color: '#8b949e', font: { size: 11 } },
                grid: { drawOnChartArea: false },
                min: 0,
                max: 100
            }
        }
    }
});

const predCtx = document.getElementById('predictionChart').getContext('2d');
const predictionChart = new Chart(predCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Predicted AQI (Indian Std)',
                data: [],
                borderColor: '#a855f7',
                backgroundColor: 'transparent',
                borderWidth: 2.5,
                tension: 0.3,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 5,
                yAxisID: 'y'
            },
            {
                label: 'Predicted Temp (C)',
                data: [],
                borderColor: '#f97316',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                tension: 0.3,
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderDash: [6, 3],
                yAxisID: 'y1'
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 800, easing: 'easeInOutQuart' },
        plugins: {
            legend: {
                labels: { color: '#8b949e', font: { size: 12 }, usePointStyle: true, pointStyleWidth: 16 }
            },
            tooltip: {
                backgroundColor: 'rgba(10, 10, 10, 0.95)',
                titleColor: '#fff',
                bodyColor: '#a0a0ab',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 14,
                cornerRadius: 12,
                displayColors: true
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#8b949e', maxRotation: 45, autoSkipPadding: 20,
                    font: { size: 10 }, maxTicksLimit: 20
                },
                grid: { color: 'rgba(255,255,255,0.03)' }
            },
            y: {
                position: 'left',
                title: { display: true, text: 'AQI (Indian Standard)', color: '#8b949e', font: { size: 11 } },
                ticks: { color: '#8b949e', font: { size: 11 } },
                grid: { color: 'rgba(255,255,255,0.04)' },
                min: 0,
                suggestedMax: 300
            },
            y1: {
                position: 'right',
                title: { display: true, text: 'Temperature (C)', color: '#8b949e', font: { size: 11 } },
                ticks: { color: '#8b949e', font: { size: 11 } },
                grid: { drawOnChartArea: false },
                min: 0,
                max: 60
            }
        }
    }
});

function renderHistorical(locationKey) {
    const data = LOCATION_DATA[locationKey];
    if (!data) return;

    const step = Math.max(1, Math.floor(data.length / 120));
    const chartData = data.filter((_, i) => i % step === 0);

    historicalChart.data.labels = chartData.map(d => d.timeLabel);
    historicalChart.data.datasets[0].data = chartData.map(d => d.airQuality);
    historicalChart.data.datasets[1].data = chartData.map(d => d.temperature);
    historicalChart.data.datasets[2].data = chartData.map(d => d.humidity);

    const avgAQI = data.reduce((s, d) => s + d.airQuality, 0) / data.length;
    const aqiStatus = getAQIStatusCalc(avgAQI);
    const lineColor = aqiStatus.hex;
    const gradient = histCtx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, lineColor + '25');
    gradient.addColorStop(1, lineColor + '00');
    historicalChart.data.datasets[0].borderColor = lineColor;
    historicalChart.data.datasets[0].backgroundColor = gradient;
    historicalChart.data.datasets[0].fill = true;

    historicalChart.update();

    const avgTemp = data.reduce((s, d) => s + d.temperature, 0) / data.length;
    const avgHum = data.reduce((s, d) => s + d.humidity, 0) / data.length;
    const peakAQI = Math.max(...data.map(d => d.airQuality));

    document.getElementById('hist-avg-aqi').textContent = Math.round(avgAQI);
    document.getElementById('hist-avg-temp').textContent = avgTemp.toFixed(1) + 'C';
    document.getElementById('hist-avg-hum').textContent = avgHum.toFixed(1) + '%';
    document.getElementById('hist-count').textContent = data.length;
    document.getElementById('hist-peak').textContent = peakAQI;
    document.getElementById('hist-duration').textContent = '6h 0m';

    const tableBody = document.getElementById('table-body');
    tableBody.innerHTML = '';
    const tableStep = Math.max(1, Math.floor(data.length / 50));
    let rowNum = 1;
    for (let i = 0; i < data.length; i += tableStep) {
        const d = data[i];
        const status = getAQIStatusCalc(d.airQuality);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${rowNum++}</td>
            <td>${d.fullTime}</td>
            <td>${d.airQuality}</td>
            <td>${d.temperature}</td>
            <td>${d.humidity}</td>
            <td class="status-cell" style="color: ${status.hex}">${status.text}</td>
        `;
        tableBody.appendChild(tr);
    }

    renderPredictions(locationKey);
}

function renderPredictions(locationKey) {
    const preds = PREDICTION_DATA[locationKey];
    if (!preds) return;

    const chartPreds = preds.filter((_, i) => i % 3 === 0);

    predictionChart.data.labels = chartPreds.map(d => d.fullLabel);
    predictionChart.data.datasets[0].data = chartPreds.map(d => d.airQuality);
    predictionChart.data.datasets[1].data = chartPreds.map(d => d.temperature);

    const avgAQI = preds.reduce((s, d) => s + d.airQuality, 0) / preds.length;
    const lineColor = avgAQI <= 100 ? '#a855f7' : avgAQI <= 200 ? '#f59e0b' : '#ef4444';
    const gradient = predCtx.createLinearGradient(0, 0, 0, 350);
    gradient.addColorStop(0, lineColor + '20');
    gradient.addColorStop(1, lineColor + '00');
    predictionChart.data.datasets[0].borderColor = lineColor;
    predictionChart.data.datasets[0].backgroundColor = gradient;
    predictionChart.data.datasets[0].fill = true;

    predictionChart.update();

    const avgPredTemp = preds.reduce((s, d) => s + d.temperature, 0) / preds.length;
    const peakPredAQI = Math.max(...preds.map(d => d.airQuality));
    const minPredAQI = Math.min(...preds.map(d => d.airQuality));

    document.getElementById('pred-avg-aqi').textContent = Math.round(avgAQI);
    document.getElementById('pred-avg-temp').textContent = avgPredTemp.toFixed(1) + 'C';
    document.getElementById('pred-peak').textContent = peakPredAQI;
    document.getElementById('pred-low').textContent = minPredAQI;
}

document.querySelectorAll('.location-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.location-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderHistorical(tab.dataset.location);

        const wrapper = document.getElementById('data-table-wrapper');
        const toggleBtn = document.getElementById('toggle-table');
        wrapper.classList.add('hidden');
        toggleBtn.textContent = 'Show Raw Data Table';
    });
});

document.getElementById('toggle-table').addEventListener('click', () => {
    const wrapper = document.getElementById('data-table-wrapper');
    const btn = document.getElementById('toggle-table');
    wrapper.classList.toggle('hidden');
    btn.textContent = wrapper.classList.contains('hidden')
        ? 'Show Raw Data Table'
        : 'Hide Raw Data Table';
});

renderHistorical('wadala');
