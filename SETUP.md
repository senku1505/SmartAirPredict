# SmartAir Predict - Hardware Setup Guide

This guide describes how to connect the ESP32, MQ135 gas sensor, and DHT22 temperature and humidity sensor on a breadboard.

---

## Hardware Components

1. ESP32 Development Board (e.g., ESP32 NodeMCU)
2. MQ135 Gas Sensor
3. DHT22 Temperature and Humidity Sensor
4. Half-size or Full-size Breadboard
5. Jumper Wires (Male-to-Male and Male-to-Female)
6. Micro-USB Cable (for power and programming)

---

## Pin Connection Table

| Component | Component Pin | ESP32 Pin | Description |
|---|---|---|---|
| MQ135 Gas Sensor | VCC | Vin (5V) | Power supply (MQ135 requires 5V for heating element) |
| MQ135 Gas Sensor | GND | GND | Ground |
| MQ135 Gas Sensor | AOUT | GPIO 34 | Analog output (Air Quality measurement) |
| MQ135 Gas Sensor | DOUT | Not Connected | Digital threshold output (not used) |
| DHT22 Sensor | VCC (Pin 1) | 3V3 (3.3V) | Power supply |
| DHT22 Sensor | DATA (Pin 2) | GPIO 15 | Digital signal output |
| DHT22 Sensor | NC (Pin 3) | Not Connected | No connection |
| DHT22 Sensor | GND (Pin 4) | GND | Ground |

---

## Step-by-Step Breadboard Instructions

### Step 1: Place the ESP32 on the Breadboard
Straddle the ESP32 over the middle divider channel of the breadboard so that the pins on the left and right sides occupy separate pin rows. Ensure there is at least one open column of holes on both sides for connecting jumper wires.

### Step 2: Wire the MQ135 Gas Sensor
1. Connect a male-to-male or male-to-female jumper wire from the VCC pin of the MQ135 to the Vin (5V output pin) of the ESP32.
2. Connect a jumper wire from the GND pin of the MQ135 to a GND pin of the ESP32.
3. Connect a jumper wire from the AOUT (Analog Output) pin of the MQ135 to GPIO 34 of the ESP32.

### Step 3: Wire the DHT22 Sensor
If using a bare DHT22 sensor:
1. Connect Pin 1 (VCC) of the DHT22 to the 3.3V (3V3) pin of the ESP32.
2. Connect Pin 2 (DATA) of the DHT22 to GPIO 15 of the ESP32. Place a 4.7k or 10k Ohm pull-up resistor between Pin 1 (VCC) and Pin 2 (DATA) if your DHT22 module does not have a built-in resistor.
3. Connect Pin 4 (GND) of the DHT22 to a GND pin of the ESP32.

---

## Important Notes

- MQ135 Preheating: The MQ135 gas sensor uses an internal heating element. It will feel warm to the touch. It requires at least 24-48 hours of initial burn-in time for stable operation, and a 2-5 minute warm-up period every time it is powered on.
- Analog Pins: GPIO 34 is on ADC1. Avoid using pins on ADC2 (GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27) for analog reads when Wi-Fi is active, as ADC2 is shared with the Wi-Fi module and analog reads will fail or return incorrect values.
