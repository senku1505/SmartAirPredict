import time
import requests
import json
import os
from twilio.rest import Client

# =================================================================
# SmartAir Alert System — Twilio SMS Integration
# Monitors Firebase Realtime Database and sends an SMS when AQI
# crosses the ALERT_THRESHOLD (Indian Standard CPCB scale).
# =================================================================

# AQI level at which we fire an SMS — 100 = start of 'Moderate' range
# Tweak this to your preference (e.g. 200 for 'Poor' only)
ALERT_THRESHOLD = 100

# 1. FIREBASE CONFIGURATION
# Using the REST API URL from app.js
FIREBASE_URL = "https://mart-fe8d0-default-rtdb.firebaseio.com/AQI_Logs.json?orderBy=\"$key\"&limitToLast=1"

# 2. TWILIO CONFIGURATION
# Load credentials from environment variables (set in .env or shell)
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN  = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_FROM_NUMBER = os.environ.get('TWILIO_FROM_NUMBER', '+15677492359')  # Your Twilio number
TO_PHONE_NUMBER    = os.environ.get('TO_PHONE_NUMBER',    '+919321637802')  # Your personal number

# 3. AQI CALCULATION (Calibrated Indian Standard)
def calculate_indian_aqi(raw_value, temperature, humidity):
    """
    Matches the logic in app.js and ml_model.py:
    1. Temp/Hum compensation
    2. Map to PM2.5 concentration
    3. CPCB breakpoint interpolation
    """
    # Step 1: Compensation
    temp_corr = 0.008 * (temperature - 25)
    hum_corr = 0.005 * (humidity - 50)
    factor = 1.0 + temp_corr + hum_corr
    adjusted = raw_value / factor
    
    # Step 2: PM2.5 Concentration
    conc = max(0, (adjusted - 200) * 0.11)

    # Step 3: CPCB Breakpoints
    if conc <= 30:   aqi = (conc / 30) * 50
    elif conc <= 60: aqi = 51 + ((conc - 30) / 30) * 49
    elif conc <= 90: aqi = 101 + ((conc - 60) / 30) * 99
    elif conc <= 120: aqi = 201 + ((conc - 90) / 30) * 99
    elif conc <= 250: aqi = 301 + ((conc - 120) / 130) * 99
    else:            aqi = 401 + ((conc - 250) / 130) * 99
    
    return round(max(0, min(500, aqi)))

def send_sms_alert(aqi_value):
    """Sends an SMS via Twilio."""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        print("\u26a0\ufe0f  SMS skipped — Twilio credentials not set. Check your .env file.")
        return
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        message = client.messages.create(
            body=(
                f"\u26a0\ufe0f SmartAir Alert: AQI is {aqi_value} (threshold: {ALERT_THRESHOLD}). "
                f"Air quality has reached Moderate or worse. Check the dashboard."
            ),
            from_=TWILIO_FROM_NUMBER,
            to=TO_PHONE_NUMBER,
        )
        print(f"\u2705 SMS sent! SID: {message.sid}")
    except Exception as e:
        print(f"\u274c Failed to send SMS: {e}")

def monitor_loop():
    print("🚀 SmartAir Alert System is now running...")
    print(f"📡 Monitoring: {FIREBASE_URL}")
    print("⏰ Interval: 1 minute")
    print("-" * 50)

    last_checked_key = None
    
    while True:
        try:
            # Fetch latest reading from Firebase
            response = requests.get(FIREBASE_URL, timeout=10)
            data = response.json()

            if not data:
                print(f"[{time.strftime('%H:%M:%S')}] No data found in Firebase.")
            else:
                # Get the latest entry (Firebase returns a dict with one key)
                key = list(data.keys())[0]
                
                # Avoid duplicate alerts for the same timestamp/reading
                if key != last_checked_key:
                    entry = data[key]
                    raw_aq = entry.get('AirQuality', 0)
                    temp = entry.get('Temperature', 28)
                    hum = entry.get('Humidity', 50)

                    aqi = calculate_indian_aqi(raw_aq, temp, hum)
                    
                    print(f"[{time.strftime('%H:%M:%S')}] New Reading - Raw: {raw_aq}, Temp: {temp}C, Hum: {hum}%, AQI: {aqi}")

                    if aqi > ALERT_THRESHOLD:
                        print(f"\U0001f6a8 ALERT: AQI {aqi} crossed threshold {ALERT_THRESHOLD}!")
                        send_sms_alert(aqi)
                    else:
                        print(f"[{time.strftime('%H:%M:%S')}] AQI {aqi} — below threshold, no alert.")
                    
                    last_checked_key = key
                else:
                    print(f"[{time.strftime('%H:%M:%S')}] No new reading since last check (AQI was stable).")

        except Exception as e:
            print(f"❌ Monitoring Error: {e}")

        # Wait for 1 minute before next check
        time.sleep(60)

if __name__ == "__main__":
    monitor_loop()
