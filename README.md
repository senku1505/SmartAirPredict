# SmartAir Predict

Real-time air quality monitoring and 1-week AQI forecasting.
An ESP32 reads MQ135 + DHT22 sensors, pushes data to Firebase, and a web dashboard visualizes live readings alongside a forecast.

---

## Features

- Live monitoring: ESP32 uploads sensor readings to Firebase Realtime DB every 5 seconds.
- Web dashboard: Dashboard reads Firebase and shows live AQI, temp, and humidity.
- 1-week forecast: Linear Regression model trained on real Open-Meteo API data and local CSV data.
- SMS alerts: Python script polls Firebase and sends a Twilio SMS when AQI crosses the threshold.
- Local testing: CSV generator simulates sensor data without needing hardware.

---

## Tech Stack

- Hardware: ESP32, MQ135 gas sensor, DHT22 temp/humidity.
- Firmware: Arduino (C++) with Firebase ESP32 Client library.
- Database: Firebase Realtime Database.
- Frontend: HTML + CSS + JS (no build step needed).
- Charts: Chart.js.
- ML model: Python (scikit-learn Linear Regression).
- API data: Open-Meteo weather and air quality APIs.
- Alerts: Python and Twilio SMS API.
- AQI standard: Indian NAQI (CPCB breakpoints for PM2.5).

---

## Project Structure

```
SmartAirPredict/
│
├── index.html                  # Dashboard
├── style.css                   # Dashboard styles
├── app.js                      # Dashboard logic
│
├── hardware/
│   ├── secrets.h               # WiFi and Firebase credentials (gitignored)
│   ├── secrets.h.example       # Template for secrets.h
│   └── smartair_esp32/
│       └── smartair_esp32.ino  # Arduino sketch
│
├── scripts/
│   └── generate_csvs.js        # Generates CSV data for local testing
│
├── data/
│   ├── historical_data_wadala.csv
│   ├── historical_data_bandra.csv
│   └── historical_data_kalyan.csv
│
├── ml_model.py                 # ML training script
├── twilio_alerts.py            # Twilio SMS alert script
│
├── .env.example                # Template for Twilio credentials
└── .gitignore
```

---

## Architecture

```
[ ESP32 Sensor Node ]  --- Wi-Fi --->  [ Firebase Realtime DB ]
                                                 |
                                                 v
[ twilio_alerts.py ]  <--- REST API --------- [ Web Dashboard ]
                                                 ^
                                                 | (trained on data)
                                           [ ml_model.py ]
```

### AQI Calculation

1. Compensation: Adjusts raw value based on temperature and humidity.
2. Mapping: Maps the corrected raw value to an estimated PM2.5 concentration.
3. Breakpoints: Converts concentration to Indian National Air Quality Index (CPCB breakpoints).

---

## Setup

### 1. Firebase

1. Create a project in Firebase Console.
2. Enable Realtime Database.
3. Update the database URL in app.js and twilio_alerts.py.

### 2. Arduino Setup

1. Install DHT sensor library and Firebase ESP32 Client library.
2. Set up ESP32 board support in Arduino IDE.
3. Copy hardware/secrets.h.example to hardware/secrets.h and fill in credentials.
4. Upload hardware/smartair_esp32/smartair_esp32.ino to the board.

### 3. Web Dashboard

Open index.html in a web browser, or serve it locally:
```bash
python3 -m http.server 8080
```

---

## Local Testing

Generate simulated sensor data:
```bash
node scripts/generate_csvs.js
```

Run the ML model training:
```bash
python3 ml_model.py
```

The script trains a simple Linear Regression model to fit AQI based on temperature, humidity, hour of day, and raw MQ135 readings. It outputs the trained formula coefficients and performance metrics (R2 and RMSE).

---

## SMS Alerts

Copy .env.example to .env and fill in Twilio credentials, then run:
```bash
python3 twilio_alerts.py
```

The alert threshold can be customized using the ALERT_THRESHOLD variable in twilio_alerts.py (default is 100).
