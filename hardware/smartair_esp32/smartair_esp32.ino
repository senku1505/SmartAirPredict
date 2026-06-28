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
