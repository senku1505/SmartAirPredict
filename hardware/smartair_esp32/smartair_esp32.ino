/*
 * SmartAir ESP32 Sensor Node (Firmware)
 * ─────────────────────────────────────────────────────────────────────────────
 * Overview:
 *   This sketch runs on an ESP32 microcontroller acting as an edge IoT node.
 *   It collects atmospheric readings (ambient temperature and relative humidity)
 *   via a DHT22 sensor and raw volatile organic compound/gas concentration levels
 *   via an MQ135 sensor.
 * 
 * Hardware Pin Mapping:
 *   - MQ135 Analog Out -> GPIO Pin 34 (configured as analog input).
 *   - DHT22 Data Pin   -> GPIO Pin 15 (configured with internal pullup).
 * 
 * Execution Flow:
 *   1. Hardware Initialization: Initializes serial communications (115200 baud)
 *      and starts the DHT sensor.
 *   2. Network Connection: Establishes a Wi-Fi link using credentials defined
 *      in the secrets.h configuration header.
 *   3. Clock Sync (NTP): Connects to global NTP pool servers to sync the system
 *      time. Configures a timezone offset of +5.5 hours (19800 seconds) for
 *      Indian Standard Time (IST). This is critical for database logging keys.
 *   4. Firebase Initialization: Configures the database URL and credentials
 *      legacy auth tokens to prepare the HTTP payload transmitter client.
 *   5. Main Monitor Loop (runs every 5 seconds):
 *      - Performs analog and digital sensor reads.
 *      - Outputs the formatted values to the Serial Monitor for local diagnostics.
 *      - Construct a JSON payload container (with sensor metrics and raw air quality).
 *      - Computes database path with Unix epoch timestamp in milliseconds.
 *      - Performs an HTTP PUT operation to write logs directly to the database.
 */

#include <DHT.h>
#include <FirebaseESP32.h>
#include <WiFi.h>
#include <time.h>

#include "secrets.h"

#define MQ135_PIN  34
#define DHTPIN     15
#define DHTTYPE    DHT22

DHT dht(DHTPIN, DHTTYPE);

FirebaseData   fbdo;
FirebaseAuth   auth;
FirebaseConfig config;

// Maps raw analog MQ135 reading to basic descriptive levels
String getRawStatus(int rawValue) {
    if (rawValue <= 800)  return "Good";
    if (rawValue <= 1500) return "Moderate";
    if (rawValue <= 2500) return "Poor";
    return "Hazardous";
}

void setup() {
    Serial.begin(115200);
    dht.begin();
    delay(2000);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to Wi-Fi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWi-Fi connected. IP: " + WiFi.localIP().toString());

    // 19800 seconds = 5h 30m offset for Indian Standard Time (IST)
    configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
    Serial.print("Syncing time via NTP");
    time_t now = time(nullptr);
    while (now < 100000) {
        delay(500);
        Serial.print(".");
        now = time(nullptr);
    }
    Serial.println("\nTime synced");

    config.database_url              = DATABASE_URL;
    config.signer.tokens.legacy_token = DATABASE_SECRET;
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    Serial.println("Firebase ready");
}

void loop() {
    int airValue = analogRead(MQ135_PIN);
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    bool dhtOk = !(isnan(temperature) || isnan(humidity));

    Serial.println("\n--- Sensor Readings ---");
    Serial.printf("Air Value: %d (%s)\n", airValue, getRawStatus(airValue).c_str());
    if (dhtOk) {
        Serial.printf("Temperature: %.1f C\n", temperature);
        Serial.printf("Humidity: %.1f %%\n", humidity);
    } else {
        Serial.println("DHT read failed");
    }

    // Appending "000" converts seconds to milliseconds without requiring 64-bit int support
    time_t now = time(nullptr);
    String path = "/AQI_Logs/" + String((unsigned long)now) + "000";

    FirebaseJson json;
    json.set("AirQuality", airValue);
    json.set("Status", getRawStatus(airValue));
    if (dhtOk) {
        json.set("Temperature", temperature);
        json.set("Humidity", humidity);
    }

    if (Firebase.setJSON(fbdo, path, json)) {
        Serial.println("Logged to Firebase");
    } else {
        Serial.printf("Firebase error: %s\n", fbdo.errorReason().c_str());
    }

    delay(5000);
}
