# SmartAir Predict — System Walkthrough

## 1. Hardware Setup

### Components
| Component | Purpose | Specs |
|---|---|---|
| **ESP32** | Microcontroller + WiFi | 3.3V logic, ADC 12-bit (0-4095) |
| **MQ135** | Air quality sensor | Detects CO, NH3, NOx, benzene. Analog output |
| **DHT11** | Temp + Humidity sensor | ±2°C accuracy, ±5% RH |

### Wiring
```
ESP32 Pin 34 (ADC) ←── MQ135 Analog Out (A0)
ESP32 Pin 15 (GPIO) ←── DHT11 Data Pin
ESP32 3.3V ──────────→ VCC (both sensors)
ESP32 GND ───────────→ GND (both sensors)
```

> MQ135 needs a **5V heater** — power it from VIN/5V pin, but read the analog signal through a voltage divider if needed (ESP32 ADC max = 3.3V).

---

## 2. Data Flow

```
Sensors → ESP32 → WiFi → Firebase RTDB → Dashboard (HTML/JS)
                                ↓
                         ml_model.py (offline training)
```

1. ESP32 reads sensors every **5 seconds**
2. Sends JSON to Firebase Realtime Database under `/AQI_Logs/{timestamp}`
3. Dashboard listens via Firebase SDK (`logsRef.on('value', ...)`)
4. Historical data is generated client-side calibrated against Open-Meteo API

---

## 3. AQI Calculation Formula

### Step 1: Temperature & Humidity Compensation
MQ135 resistance changes with ambient conditions. We compensate:

```
tempCorrection = 0.008 × (temperature - 25)
humCorrection  = 0.005 × (humidity - 50)
compensationFactor = 1.0 + tempCorrection + humCorrection
adjustedRaw = rawMQ135 / compensationFactor
```

### Step 2: Map to PM2.5 Concentration (µg/m³)
```
concentration = max(0, (adjustedRaw - 200) × 0.11)
```
Calibrated against IQAir/CPCB ground station data for Mumbai.

### Step 3: Indian NAQI Breakpoint Mapping
Based on **CPCB National Air Quality Index** breakpoints for PM2.5:

| PM2.5 (µg/m³) | AQI Range | Category |
|---|---|---|
| 0 – 30 | 0 – 50 | Good |
| 31 – 60 | 51 – 100 | Satisfactory |
| 61 – 90 | 101 – 200 | Moderate |
| 91 – 120 | 201 – 300 | Poor |
| 121 – 250 | 301 – 400 | Very Poor |
| 250+ | 401 – 500 | Severe |

Formula (linear interpolation within each bracket):
```
if conc ≤ 30:  AQI = (conc / 30) × 50
if conc ≤ 60:  AQI = 51 + ((conc - 30) / 30) × 49
if conc ≤ 90:  AQI = 101 + ((conc - 60) / 30) × 99
...and so on
```

### Step 4: Clamp
```
AQI = clamp(AQI, 0, 500)
```

---

## 4. Historical Data Generation

For each location (Wadala, Bandra, Kalyan):

1. **Real anchor data** from [Open-Meteo API](https://open-meteo.com) — actual hourly temp, humidity, CO, PM2.5 for Mumbai coordinates (April 23, 2026)
2. **Interpolate** between hourly anchor points to get sub-minute resolution
3. **Add sensor noise** — DHT11-like (±0.3°C, ±1.5% RH) and MQ135 analog jitter
4. **Location offsets** — Kalyan gets +150 raw boost (industrial), Bandra +50 (traffic)
5. **Spike injection** — 3% chance of pollution spike events (traffic, local burning)
6. Result: ~432 data points per location over 6 hours (9 AM – 3 PM)

---

## 5. Prediction Engine (1-Week Forecast)

Uses simplified **Linear Regression** trained on the 6-hour historical data:

```
predicted_raw_AQ = avg_raw_AQ
    + w_temp × (predicted_temp - avg_temp)
    + w_hum  × (predicted_hum - avg_hum)
    + w_hour × sin(hour_of_day)
```

Where:
- `w_temp` = derived from CO range / temp range in real data
- `w_hum` = -2.5 (higher humidity → lower readings, coastal effect)
- `w_hour` = 8 (diurnal cycle effect)
- Weekday multiplier: ×1.05 (more traffic Mon–Fri)

The predicted raw value is then converted to AQI using the same formula above.

---

## 6. ML Model (`ml_model.py`)

- Fetches 7 days of real data from Open-Meteo for all 3 locations
- Features: `temperature`, `humidity`, `hour`, `carbon_monoxide`
- Target: simulated MQ135 raw reading
- Model: `sklearn.linear_model.LinearRegression`
- Outputs: R², RMSE, MAE, MAPE metrics + per-location 1-week forecasts

---

## 8. SMS Alert System (`twilio_alerts.py`)

The system includes a Python-based background worker that:
1. Connects to the **Firebase Realtime Database** via REST API.
2. Fetches the latest sensor reading every **1 minute**.
3. Calculates the Indian Standard AQI using the calibrated formula.
4. If **AQI > 50**, it triggers an SMS alert via **Twilio**.

### Configuration
Update these variables in `twilio_alerts.py`:
- `TWILIO_ACCOUNT_SID`: Your Twilio SID.
- `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token.
- `TWILIO_FROM_NUMBER`: Your Twilio virtual phone number.
- `TO_PHONE_NUMBER`: Your verified mobile number.

### Running the Alerts
```bash
# Install dependencies
pip install twilio requests

# Run the background monitor
python3 twilio_alerts.py
```

---

## 9. File Structure

```
SmartAirProject/
├── index.html          ← Dashboard UI
├── style.css           ← Premium dark theme
├── app.js              ← Firebase listener + data engine + charts
├── ml_model.py         ← Offline ML training script
├── historical_data_wadala.csv
├── historical_data_bandra.csv
├── historical_data_kalyan.csv
└── esp32_sensor_node/
    └── esp32_sensor_node.ino  ← Arduino code for ESP32
├── twilio_alerts.py    ← NEW: SMS alert system
└── walkthrough.md      ← This document
