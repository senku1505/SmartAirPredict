"""
SmartAir Alert System - Twilio Integration

Monitors the Firebase database for new air quality logs and sends a Twilio
SMS alert if the calculated AQI crosses the designated threshold.
"""

import time
import requests
import os
from twilio.rest import Client

ALERT_THRESHOLD = 100
FIREBASE_URL = "https://mart-fe8d0-default-rtdb.firebaseio.com/AQI_Logs.json?orderBy=\"$key\"&limitToLast=1"

TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN  = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_FROM_NUMBER = os.environ.get('TWILIO_FROM_NUMBER', '+15677492359')
TO_PHONE_NUMBER    = os.environ.get('TO_PHONE_NUMBER',    '+919321637802')

def calculate_indian_aqi(raw_value, temperature, humidity):
    # Adjust raw MQ135 analog resistance values based on temperature and humidity offset
    temp_corr = 0.008 * (temperature - 25)
    hum_corr = 0.005 * (humidity - 50)
    factor = 1.0 + temp_corr + hum_corr
    adjusted = raw_value / factor
    
    # Map the compensated raw value to estimated PM2.5 concentration (in ug/m3)
    conc = max(0, (adjusted - 200) * 0.11)

    # Apply Indian CPCB breakpoints to calculate the final AQI value
    if conc <= 30:   aqi = (conc / 30) * 50
    elif conc <= 60: aqi = 51 + ((conc - 30) / 30) * 49
    elif conc <= 90: aqi = 101 + ((conc - 60) / 30) * 99
    elif conc <= 120: aqi = 201 + ((conc - 90) / 30) * 99
    elif conc <= 250: aqi = 301 + ((conc - 120) / 130) * 99
    else:            aqi = 401 + ((conc - 250) / 130) * 99
    
    return round(max(0, min(500, aqi)))

def send_sms_alert(aqi_value):
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        print("SMS skipped - Twilio credentials not set in environment.")
        return
    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=f"SmartAir Alert: AQI is {aqi_value} (threshold: {ALERT_THRESHOLD}). Check the dashboard.",
            from_=TWILIO_FROM_NUMBER,
            to=TO_PHONE_NUMBER
        )
        print("SMS alert sent successfully.")
    except Exception as e:
        print(f"Failed to send SMS: {e}")

def monitor_loop():
    print("Monitoring started...")
    last_checked_key = None
    
    while True:
        try:
            # Query Firebase for the single most recent log entry
            response = requests.get(FIREBASE_URL, timeout=10)
            data = response.json()

            if data:
                key = list(data.keys())[0]
                # Check the database key to avoid resending alerts for the same reading
                if key != last_checked_key:
                    entry = data[key]
                    raw_aq = entry.get('AirQuality', 0)
                    temp = entry.get('Temperature', 28)
                    hum = entry.get('Humidity', 50)

                    aqi = calculate_indian_aqi(raw_aq, temp, hum)
                    print(f"[{time.strftime('%H:%M:%S')}] Raw: {raw_aq}, Temp: {temp}C, Hum: {hum}%, AQI: {aqi}")

                    if aqi > ALERT_THRESHOLD:
                        print(f"ALERT: AQI {aqi} crossed threshold {ALERT_THRESHOLD}!")
                        send_sms_alert(aqi)
                    
                    last_checked_key = key
        except Exception as e:
            print(f"Error in monitor loop: {e}")

        time.sleep(60)

if __name__ == "__main__":
    monitor_loop()
