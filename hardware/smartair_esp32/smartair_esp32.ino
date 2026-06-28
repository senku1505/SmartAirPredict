/*
 * SmartAir Predict — ESP32 Sensor Node
 * ─────────────────────────────────────────────────────────────────────────
 * Reads MQ135 (air quality) + DHT22 (temp/humidity) every 5 seconds and
 * pushes the data to Firebase Realtime Database under /AQI_Logs/<timestamp>.
 *
 * Hardware:
 *   - ESP32 dev board (any variant with ADC on GPIO 34)
 *   - MQ135 gas sensor → GPIO 34 (analog)
 *   - DHT22 temperature/humidity sensor → GPIO 15 (digital)
 *
 * Required Arduino libraries (install via Library Manager):
 *   - DHT sensor library by Adafruit
 *   - Firebase ESP32 Client by mobizt
 *
 * Credentials are in secrets.h (NOT committed to git).
 * Copy secrets.h.example → secrets.h and fill in your values before flashing.
 */

#include <DHT.h>
#include <FirebaseESP32.h>
#include <WiFi.h>
#include <time.h>

#include "secrets.h"   // WiFi + Firebase credentials (gitignored)

// ── Pin config ─────────────────────────────────────────────────────────────
#define MQ135_PIN  34   // Analog input — make sure this ADC pin isn't used for Wi-Fi
#define DHTPIN     15   // Digital input
#define DHTTYPE    DHT22

DHT dht(DHTPIN, DHTTYPE);

// ── Firebase objects ────────────────────────────────────────────────────────
FirebaseData   fbdo;
FirebaseAuth   auth;
FirebaseConfig config;

// ── Helpers ─────────────────────────────────────────────────────────────────

// Raw MQ135 threshold labels — these are the on-device thresholds used for
// the "Status" field in Firebase. The web dashboard converts the raw value
// to a proper CPCB-calibrated AQI, so these are just quick indicators.
String getRawStatus(int rawValue) {
    if (rawValue <= 800)  return "Good";
    if (rawValue <= 1500) return "Moderate";
    if (rawValue <= 2500) return "Poor";
    return "Hazardous";
}

// ── Setup ───────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    dht.begin();

    // Give the DHT sensor a moment to stabilise
    delay(2000);

    // Connect to Wi-Fi
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to Wi-Fi");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\n✅ Wi-Fi connected — IP: " + WiFi.localIP().toString());

    // Sync time from NTP (Firebase timestamps need UTC)
    // IST = UTC+5:30 (offset 19800 seconds)
    configTime(19800, 0, "pool.ntp.org", "time.nist.gov");
    Serial.print("⏳ Syncing time via NTP");
    time_t now = time(nullptr);
    while (now < 100000) {
        delay(500);
        Serial.print(".");
        now = time(nullptr);
    }
    Serial.println("\n✅ Time synced");

    // Connect to Firebase
    config.database_url              = DATABASE_URL;
    config.signer.tokens.legacy_token = DATABASE_SECRET;
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    Serial.println("🔥 Firebase ready");
}

// ── Main loop ───────────────────────────────────────────────────────────────
void loop() {
    // Read sensors
    int   airValue   = analogRead(MQ135_PIN);
    float temperature = dht.readTemperature();
    float humidity    = dht.readHumidity();
    bool  dhtOk       = !(isnan(temperature) || isnan(humidity));

    // Print to Serial Monitor for debugging
    Serial.println("\n====== SENSOR READING ======");
    Serial.printf("💨 MQ135 raw:  %d  (%s)\n", airValue, getRawStatus(airValue).c_str());
    if (dhtOk) {
        Serial.printf("🌡  Temperature: %.1f °C\n", temperature);
        Serial.printf("💧 Humidity:    %.1f %%\n", humidity);
    } else {
        Serial.println("⚠️  DHT22 read failed — using defaults");
    }

    // Build the Firebase path: /AQI_Logs/<epoch_ms>
    // We append "000" to convert seconds → milliseconds without needing 64-bit math.
    time_t now   = time(nullptr);
    String path  = "/AQI_Logs/" + String((unsigned long)now) + "000";

    // Build the JSON payload
    FirebaseJson json;
    json.set("AirQuality", airValue);
    json.set("Status",     getRawStatus(airValue));
    if (dhtOk) {
        json.set("Temperature", temperature);
        json.set("Humidity",    humidity);
    }

    // Push to Firebase
    if (Firebase.setJSON(fbdo, path, json)) {
        Serial.println("✅ Uploaded to Firebase");
    } else {
        Serial.printf("❌ Firebase error: %s\n", fbdo.errorReason().c_str());
    }

    // 5-second interval between readings
    delay(5000);
}
