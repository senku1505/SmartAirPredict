# SmartAir Predict 🌫️

Real-time IoT air quality monitoring and 1-week AQI forecasting for Mumbai, India.  
An ESP32 reads MQ135 + DHT22 sensors every 5 seconds, pushes data to Firebase, and a web dashboard visualises live readings alongside a machine-learning forecast.

---

## What it does

| Feature | Details |
|---|---|
| **Live monitoring** | ESP32 uploads sensor readings to Firebase Realtime DB every 5 s |
| **Web dashboard** | Vanilla JS / Chart.js dashboard reads Firebase and shows live AQI, temp & humidity |
| **1-week forecast** | Linear Regression model trained on real Open-Meteo API data + local CSV data |
| **SMS alerts** | Python script polls Firebase and fires a Twilio SMS when AQI > threshold |
| **Local testing** | CSV generator simulates realistic sensor data without needing hardware |

---

## Tech stack

| Layer | Technology |
|---|---|
| Hardware | ESP32, MQ135 gas sensor, DHT22 temp/humidity |
| Firmware | Arduino (C++) with Firebase ESP32 Client library |
| Database | Firebase Realtime Database |
| Frontend | HTML + Vanilla CSS + Vanilla JS (no build step needed) |
| Charts | Chart.js (CDN) |
| ML model | Python — scikit-learn Linear Regression |
| API data | Open-Meteo weather + air quality APIs (free, no key needed) |
| Alerts | Python + Twilio SMS API |
| AQI standard | Indian NAQI — CPCB breakpoints for PM2.5 |

---

## Project structure

```
SmartAirPredict/
│
├── index.html                  # Dashboard (open in browser or serve with any HTTP server)
├── style.css                   # Dashboard styles
├── app.js                      # Dashboard logic — Firebase listener, charts, AQI calc
│
├── hardware/
│   ├── secrets.h               # ⚠️  Your WiFi + Firebase credentials — GITIGNORED
│   ├── secrets.h.example       # Template — copy this to secrets.h and fill in
│   └── smartair_esp32/
│       └── smartair_esp32.ino  # Arduino sketch for the ESP32 sensor node
│
├── scripts/
│   └── generate_csvs.js        # Generates synthetic CSV data for local testing
│
├── data/
│   ├── historical_data_wadala.csv
│   ├── historical_data_bandra.csv
│   └── historical_data_kalyan.csv
│
├── ml_model.py                 # ML training script (uses data/ CSVs + Open-Meteo API)
├── twilio_alerts.py            # Polls Firebase and sends SMS alerts via Twilio
│
├── .env.example                # Template for Twilio credentials
└── .gitignore
```

---

## Architecture

```
┌─────────────────────┐         Wi-Fi          ┌──────────────────────┐
│   ESP32 Sensor Node │ ──────────────────────► │  Firebase Realtime DB │
│                     │                         └──────────┬───────────┘
│  MQ135 → GPIO 34    │                                    │  websocket
│  DHT22 → GPIO 15    │                         ┌──────────▼───────────┐
└─────────────────────┘                         │   Web Dashboard       │
                                                │   (index.html)        │
                                                │   - Live AQI cards    │
                                                │   - Chart.js graphs   │
┌─────────────────────┐         polls           │   - 1-week forecast   │
│  twilio_alerts.py   │ ◄── Firebase REST API   └───────────────────────┘
│  (Python script)    │
│  sends SMS if AQI   │         trains on
│  > threshold        │    ┌──────────────────┐
└─────────────────────┘    │  ml_model.py     │
                           │  - data/ CSVs    │
                           │  - Open-Meteo API│
                           └──────────────────┘
```

### How the AQI is calculated

The dashboard, ML model, and alert script all use the same formula (kept in sync):

1. **Temp/humidity compensation** — MQ135 resistance shifts with ambient conditions, so we apply a small correction factor.
2. **PM2.5 concentration mapping** — The corrected raw ADC value is mapped to an estimated PM2.5 concentration (µg/m³), calibrated against real IQAir/CPCB readings for Mumbai.
3. **CPCB breakpoint interpolation** — The PM2.5 concentration is converted to an AQI value using the official Indian National Air Quality Index breakpoints.

| PM2.5 (µg/m³) | AQI range | Category |
|---|---|---|
| 0–30 | 0–50 | Good |
| 31–60 | 51–100 | Satisfactory |
| 61–90 | 101–200 | Moderate |
| 91–120 | 201–300 | Poor |
| 121–250 | 301–400 | Very Poor |
| 250+ | 401–500 | Severe |

---

## Setup

### 1. Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) → create a new project.
2. Enable **Realtime Database** (start in test mode is fine while developing).
3. Note down your **Database URL** (looks like `https://your-project-default-rtdb.firebaseio.com`).
4. Get your **Database Secret**: Project Settings → Service Accounts → Database Secrets.

Update the database URL in `app.js` (line 5) and `twilio_alerts.py` (line 14) with your project's URL.

### 2. Arduino / ESP32 firmware

#### Required libraries

Install these via **Arduino IDE → Tools → Manage Libraries**:

| Library | Author | Purpose |
|---|---|---|
| `DHT sensor library` | Adafruit | Read DHT22 sensor |
| `Firebase ESP32 Client` | mobizt | Push data to Firebase |

#### Board setup

1. In Arduino IDE: **File → Preferences → Additional Boards Manager URLs**, add:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
2. **Tools → Board → Boards Manager** → search "esp32" → install the Espressif package.
3. Select your board: **Tools → Board → ESP32 Arduino → ESP32 Dev Module** (or your specific variant).

#### Credentials

```bash
# Copy the template
cp hardware/secrets.h.example hardware/secrets.h

# Edit hardware/secrets.h — fill in your actual values:
#   WIFI_SSID, WIFI_PASSWORD, DATABASE_URL, DATABASE_SECRET
```

> `hardware/secrets.h` is in `.gitignore` — it will never be committed.

#### Wiring

| ESP32 Pin | Sensor | Notes |
|---|---|---|
| GPIO 34 | MQ135 AOUT | Analog input — do not use for Wi-Fi antenna |
| GPIO 15 | DHT22 DATA | Digital input |
| 3.3V / GND | Both sensors | MQ135 also needs 5V on VCC for proper warm-up |

> ⚠️ The MQ135 needs a **5-minute warm-up** after power-on before readings are accurate.

#### Flash

Open `hardware/smartair_esp32/smartair_esp32.ino` in Arduino IDE, select your COM port, and click Upload.  
Open **Serial Monitor** at 115200 baud to see live output.

### 3. Web dashboard

No build step needed — just open `index.html` in a browser (or serve it with any HTTP server):

```bash
# Python one-liner
python3 -m http.server 8080
# then open http://localhost:8080
```

The dashboard reads from Firebase in real time. Until the ESP32 is running (or you seed Firebase manually), the live cards will show `--`.

---

## Local testing (without hardware)

The CSV generator creates realistic simulated sensor data using real Open-Meteo hourly values as anchors, with DHT22-like noise layered on top.

```bash
# Generate the CSVs (writes to data/)
node scripts/generate_csvs.js
```

Output files:
- `data/historical_data_wadala.csv`
- `data/historical_data_bandra.csv`
- `data/historical_data_kalyan.csv`

Each CSV has 60 rows representing one minute intervals from 9:00 AM, with columns:

```
Location, Reading #, Timestamp, Air Quality (Raw MQ135), AQI (Indian Std), Temperature (C), Humidity (%)
```

### Running the ML model with CSV data

```bash
pip install numpy pandas scikit-learn requests

# Runs ML training on the local CSVs + live Open-Meteo API data
python ml_model.py
```

The script prints model performance metrics (R², RMSE, MAE) and per-location summaries. If the Open-Meteo API is unreachable, it falls back to CSV-only training.

### Switching from local CSVs to real hardware

The web dashboard (`app.js`) already reads from Firebase. The CSVs are only used by `ml_model.py` for training. Here's the full picture:

| Mode | What changes |
|---|---|
| **Local testing** | Run `generate_csvs.js` → `ml_model.py` reads from `data/` |
| **Real hardware** | Flash ESP32 → it writes to Firebase → dashboard auto-updates |
| **Both together** | Flash ESP32 + keep CSVs for ML training — they're independent |

The only code change needed to switch is in `app.js` lines 4–6:  
replace the Firebase `databaseURL` with your own project's URL.  
Everything else (AQI formula, chart logic, prediction engine) works the same.

---

## SMS alerts (Twilio)

```bash
# Install dependencies
pip install twilio requests

# Copy and fill in credentials
cp .env.example .env
# edit .env with your TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, etc.

# Run the alert monitor (polls Firebase every 60 seconds)
python twilio_alerts.py
```

The default alert threshold is **AQI > 100** (start of Moderate range). To change it, edit `ALERT_THRESHOLD` at the top of `twilio_alerts.py`.

Get Twilio credentials at [twilio.com/console](https://www.twilio.com/console).

---

## Locations monitored

| Location | Coordinates | Area type | Typical AQI |
|---|---|---|---|
| Wadala | 19.0178, 72.8575 | Central Mumbai | ~100–115 |
| Bandra | 19.0544, 72.8264 | Western Mumbai (coastal) | ~85–95 |
| Kalyan | 19.2437, 73.1355 | Thane (industrial) | ~120–140 |

Real AQI values calibrated against IQAir and CPCB data for April 2026.

---

## Licence

MIT — do whatever you want with it.
