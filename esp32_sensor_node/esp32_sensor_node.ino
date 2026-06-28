#include <DHT.h>
#include <FirebaseESP32.h>
#include <WiFi.h>
#include <time.h>

// ================== WiFi ==================
#define WIFI_SSID “Patil”
#define WIFI_PASSWORD “shiv @2197“

// ================== Firebase ==================
#define DATABASE_URL "https://mart-fe8d0-default-rtdb.firebaseio.com/"
#define DATABASE_SECRET "rVvEMFjljwq1keBtw5tjVIlyZwlJpzfhlFn91pQI"

// ================== MQ135 ==================
#define MQ135_PIN 34

// ================== DHT22 ==================
#define DHTPIN 15
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Firebase objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ================== AQI FUNCTION ==================
String getAQIStatus(int value) {
  if (value <= 800)
    return "Good";
  else if (value <= 1500)
    return "Moderate";
  else if (value <= 2500)
    return "Poor";
  else
    return "Hazardous";
}

void setup() {
  Serial.begin(115200);

  // Start DHT
  dht.begin();
  delay(2000);

  // ================== WiFi ==================
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n✅ WiFi Connected");

  // ================== TIME (NTP) ==================
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");

  Serial.print("⏳ Syncing time");
  time_t now = time(nullptr);

  while (now < 100000) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }

  Serial.println("\n✅ Time synced");

  // ================== Firebase ==================
  config.database_url = DATABASE_URL;
  config.signer.tokens.legacy_token = DATABASE_SECRET;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Serial.println("🔥 Firebase Ready");
}

void loop() {

  // ================== MQ135 ==================
  int airValue = analogRead(MQ135_PIN);
  String status = getAQIStatus(airValue);

  // ================== DHT ==================
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  bool dht_ok = !(isnan(temperature) || isnan(humidity));

  // ================== SERIAL ==================
  Serial.println("\n====== AQI MONITOR ======");

  Serial.print("🌫 Air Value: ");
  Serial.println(airValue);

  Serial.print("📊 Status: ");
  Serial.println(status);

  if (dht_ok) {
    Serial.print("🌡 Temp: ");
    Serial.print(temperature);
    Serial.println(" °C");

    Serial.print("💧 Humidity: ");
    Serial.print(humidity);
    Serial.println(" %");
  } else {
    Serial.println("⚠ DHT Read Failed");
  }

  // ================== FIREBASE PATH ==================
  time_t now = time(nullptr);
  // Append "000" to seconds to get milliseconds as a string, avoiding 32-bit
  // int overflow!
  String path = "/AQI_Logs/" + String((unsigned long)now) + "000";

  // ================== JSON BUILD ==================
  FirebaseJson json;

  json.set("AirQuality", airValue);
  json.set("Status", status);

  if (dht_ok) {
    json.set("Temperature", temperature);
    json.set("Humidity", humidity);
  }

  // ================== UPLOAD ==================
  if (Firebase.setJSON(fbdo, path, json)) {
    Serial.println("✅ Logged to Firebase");
  } else {
    Serial.print("❌ Error: ");
    Serial.println(fbdo.errorReason());
  }

  // ================== DELAY ==================
  delay(5000); // unchanged as requested
}