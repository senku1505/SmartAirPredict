"""
SmartAir Predict - Machine Learning Model Trainer
─────────────────────────────────────────────────────────────────────────────
Description:
  This script trains a Linear Regression model to forecast ambient air quality
  (Indian Standard CPCB AQI) based on atmospheric inputs and gas sensor readings.
  The model output parameters are used by the dashboard's client-side forecast engine.

Data Ingestion & Integration:
  1. Local Datasets: Loads CSV logs generated for monitored locations (Wadala,
     Bandra, and Kalyan) from the data/ folder.
  2. Live API: Queries the Open-Meteo Weather and Air Quality REST APIs for 
     historical outdoor records over the past 7 days.
  3. Feature Extraction: Combines local and global records. Calculates raw MQ135
     equivalents from API CO/PM2.5 measurements to ensure model alignment.

Processing Pipeline:
  - Temperature/Humidity Compensation: Sensor readings fluctuate based on ambient
    humidity and temperature. We apply an adjustment factor to offset this.
  - CPCB Breakpoint Mapping: Maps estimated PM2.5 values into the official
    Indian National Air Quality Index (NAQI) categories.

Model Training & Evaluation:
  - Features: Temperature, Humidity, Hour of day, and Raw MQ135 sensor readings.
  - Target: Calculated Indian Standard CPCB AQI.
  - Split: 80% training set, 20% test validation set.
  - Model: Ordinary Least Squares Linear Regression.
  - Verification: Computes R2 score and Root Mean Squared Error (RMSE) to track accuracy.
"""

import numpy as np
import pandas as pd
import requests
import os
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score
from datetime import datetime, timedelta

LOCATIONS = {
    'Wadala': {'lat': 19.0178, 'lon': 72.8575},
    'Bandra': {'lat': 19.0544, 'lon': 72.8264},
    'Kalyan': {'lat': 19.2437, 'lon': 73.1355}
}

_DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
CSV_FILES = {
    'Wadala': os.path.join(_DATA_DIR, 'historical_data_wadala.csv'),
    'Bandra': os.path.join(_DATA_DIR, 'historical_data_bandra.csv'),
    'Kalyan': os.path.join(_DATA_DIR, 'historical_data_kalyan.csv')
}

def calculate_indian_aqi(raw_value, temperature, humidity):
    temp_corr = 0.008 * (temperature - 25)
    hum_corr = 0.005 * (humidity - 50)
    factor = 1.0 + temp_corr + hum_corr
    adjusted = raw_value / factor
    conc = max(0, (adjusted - 200) * 0.11)

    if conc <= 30:   return round((conc / 30) * 50)
    elif conc <= 60: return round(51 + ((conc - 30) / 30) * 49)
    elif conc <= 90: return round(101 + ((conc - 60) / 30) * 99)
    elif conc <= 120: return round(201 + ((conc - 90) / 30) * 99)
    elif conc <= 250: return round(301 + ((conc - 120) / 130) * 99)
    else:            return round(401 + ((conc - 250) / 130) * 99)

def fetch_api_data(name, lat, lon, days_back=7):
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')

    # Pull hourly temperature, humidity, carbon monoxide, and PM2.5 fields from Open-Meteo
    weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=temperature_2m,relative_humidity_2m&timezone=Asia%2FKolkata&start_date={start_date}&end_date={end_date}"
    aq_url = f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&hourly=pm2_5,pm10,carbon_monoxide&timezone=Asia%2FKolkata&start_date={start_date}&end_date={end_date}"

    try:
        weather = requests.get(weather_url, timeout=10).json()
        aq = requests.get(aq_url, timeout=10).json()
        
        n = min(len(weather['hourly']['temperature_2m']), len(aq['hourly']['pm2_5']))
        df = pd.DataFrame({
            'temperature': weather['hourly']['temperature_2m'][:n],
            'humidity': weather['hourly']['relative_humidity_2m'][:n],
            'pm25': aq['hourly']['pm2_5'][:n],
            'carbon_monoxide': aq['hourly']['carbon_monoxide'][:n],
            'location': name
        }).dropna()

        # Map API CO and PM2.5 readings back to raw MQ135 values for linear training consistency
        df['mq135_raw'] = (df['carbon_monoxide'] * 1.2) + (df['pm25'] * 5.0)
        df['hour'] = pd.to_datetime(weather['hourly']['time'][:len(df)]).hour
        df['aqi'] = df.apply(lambda r: calculate_indian_aqi(r['mq135_raw'], r['temperature'], r['humidity']), axis=1)
        return df
    except Exception as e:
        print(f"API fetch failed for {name}: {e}")
        return None

def load_csv_data():
    all_csv = []
    for name, fpath in CSV_FILES.items():
        if not os.path.exists(fpath):
            continue
        df = pd.read_csv(fpath)
        df.columns = df.columns.str.strip()
        col_map = {
            'Air Quality (Raw MQ135)': 'mq135_raw',
            'AQI (Indian Std)':        'aqi',
            'Temperature (C)':         'temperature',
            'Humidity (%)':            'humidity',
            'Location':                'location',
            'Timestamp':               'timestamp'
        }
        df = df.rename(columns=col_map)
        df['hour'] = pd.to_datetime(df['timestamp'], format='mixed').dt.hour
        all_csv.append(df)
    return pd.concat(all_csv, ignore_index=True) if all_csv else None

def main():
    print("Loading datasets...")
    csv_data = load_csv_data()
    
    api_data = []
    for name, coords in LOCATIONS.items():
        df = fetch_api_data(name, coords['lat'], coords['lon'])
        if df is not None:
            api_data.append(df)
            
    api_combined = pd.concat(api_data, ignore_index=True) if api_data else None
    datasets = [d for d in [csv_data, api_combined] if d is not None]
    
    if not datasets:
        print("No training data available.")
        return

    common_cols = ['temperature', 'humidity', 'hour', 'mq135_raw', 'aqi', 'location']
    for d in datasets:
        for col in common_cols:
            if col not in d.columns and col == 'aqi':
                d['aqi'] = d.apply(lambda r: calculate_indian_aqi(r['mq135_raw'], r['temperature'], r['humidity']), axis=1)

    combined = pd.concat(datasets, ignore_index=True).dropna(subset=['temperature', 'humidity', 'mq135_raw', 'aqi'])
    print(f"Total dataset: {len(combined)} points.")

    X = combined[['temperature', 'humidity', 'hour', 'mq135_raw']]
    y = combined['aqi']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = LinearRegression()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))

    print("Model Performance:")
    print(f"  R2 Score: {r2:.4f}")
    print(f"  RMSE: {rmse:.2f}")
    
    weights = model.coef_
    intercept = model.intercept_
    print(f"Formula: AQI = {weights[0]:.4f}*Temp + {weights[1]:.4f}*Hum + {weights[2]:.4f}*Hour + {weights[3]:.4f}*MQ135 + {intercept:.4f}")

if __name__ == "__main__":
    main()
