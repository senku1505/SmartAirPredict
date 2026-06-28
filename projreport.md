# SmartAir Predict — Full Project Flow & ML Metrics

## 📊 End-to-End Project Flow

| Step | What Happens | Component | Output |
|---:|---|---|---|
| 1 | MQ135 heats up & detects gases (CO, NH₃, NOₓ) | MQ135 Sensor | Analog voltage (0–3.3V) |
| 2 | ESP32 ADC reads voltage on GPIO 34 | ESP32 (12-bit ADC) | Raw integer `0–4095` |
| 3 | DHT11 reads temperature & humidity on GPIO 15 | DHT11 Sensor | `°C` and `%RH` |
| 4 | ESP32 packages data as JSON | ESP32 firmware | `{AirQuality, Temperature, Humidity}` |
| 5 | ESP32 sends JSON over WiFi to Firebase | WiFi + HTTPS | Firebase RTDB entry at `/AQI_Logs/{ts}` |
| 6 | Dashboard listens for new entries in real-time | Firebase JS SDK | Live data on cards + chart |
| 7 | Raw MQ135 value → compensated for temp/humidity | `calculateIndianAQI()` | Adjusted raw value |
| 8 | Adjusted value → PM2.5 concentration (µg/m³) | Concentration mapping | `conc = (adj - 200) × 0.11` |
| 9 | Concentration → Indian Standard AQI via CPCB breakpoints | Breakpoint interpolation | AQI `0–500` (dimensionless) |
| 10 | Historical data generated for 3 locations (6h each) | Client-side engine | 432 data points per location |
| 11 | ML model trained on CSV + Open-Meteo data (756 pts) | `sklearn.LinearRegression` | Trained model weights |
| 12 | Model predicts 1-week hourly AQI per location | Prediction engine | 168 hourly forecasts × 3 locations |
| 13 | All data visualized on premium dark-theme dashboard | Chart.js + vanilla JS | Charts, cards, tables |
| 14 | Monitor AQI in background & send SMS via Twilio | `twilio_alerts.py` | SMS alert on phone if AQI > 50 |

---

## 📈 ML Model Performance (from `ml_model.py`)

| Metric | Value | What It Means |
|---|---|---|
| **R² Score** | **0.9941** | Model explains **99.4%** of the variance — excellent fit |
| **RMSE** | **1.86** AQI pts | Predictions are off by ~2 AQI points on average. RMSE penalizes large errors more heavily than MAE — useful for catching outlier predictions |
| **MAE** | **1.24** AQI pts | Average absolute error is just ~1 AQI point |
| **MAPE** | **2.62%** | Mean Absolute Percentage Error |
| **Accuracy** | **97.38%** | `(1 - MAPE) × 100` |

> **RMSE > MAE** (1.86 vs 1.24) indicates some predictions have larger errors than others. This is expected — pollution spikes are harder to predict than steady-state readings.

### Trained Formula
```
AQI = -0.7009×temperature - 0.4405×humidity + 0.0321×hour + 0.1824×mq135_raw + 3.7270
```

### Per-Location Results (Training Baseline)

| Location | Data Points | Avg Temp | Avg Humidity | Avg Raw MQ135 | Avg AQI | Peak AQI |
|---|---|---|---|---|---|---|
| Wadala | 252 | 31.2°C | 55.7% | 640 | 74 | 156 |
| Bandra | 252 | 31.2°C | 55.5% | 512 | 52 | 122 |
| Kalyan | 252 | 33.3°C | 42.2% | 554 | 63 | 115 |

---

## ⚠️ Hardware Errors & Limitations

| Source | Error Type | Magnitude | Impact on AQI |
|---|---|---|---|
| **DHT11 Temperature** | ±2°C accuracy | Can shift compensation factor by ±1.6% | AQI may vary by ±5–8 points |
| **DHT11 Humidity** | ±5% RH accuracy | Shifts humidity correction | AQI may vary by ±3–5 points |
| **DHT11 Sampling** | Slow (1 reading/sec max) | Misses rapid changes | Delayed response to sudden events |
| **MQ135 Warm-up** | First 24–48 hrs unreliable | Raw values drift significantly | Readings invalid until stabilized |
| **MQ135 Cross-sensitivity** | Reacts to alcohol, smoke, perfume | Can spike 200–500+ raw units | False high AQI readings indoors |
| **MQ135 Non-linearity** | Response curve is logarithmic | Low-concentration readings are imprecise | AQI 0–50 range has higher % error |
| **ESP32 ADC** | Non-linear, ±1% at extremes | ~40 counts error at high voltage | ±5 raw units → ~1–2 AQI points |
| **WiFi Drops** | Data gaps when signal is weak | Missing entries in Firebase | Gaps in time-series charts |
| **Power Supply** | MQ135 heater needs stable 5V | Brownouts reduce heater temp | Raw values drop → false low AQI |

### Key Statement for Report:
> "The system's primary error sources are the DHT11's ±2°C/±5% RH tolerance and the MQ135's 24-48 hour burn-in period and cross-sensitivity to non-target gases. Combined worst-case measurement uncertainty is estimated at ±10–15 AQI points."
