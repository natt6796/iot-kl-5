#include <Arduino.h>
#include <stdio.h>
#include <WiFiS3.h>

const char WIFI_SSID[] = "YOUR_WIFI_SSID";
const char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
const IPAddress SERVER_IP(192, 168, 1, 50);  // Change to the computer's IP shown by server.py
const uint16_t SERVER_PORT = 8000;

const int MOISTURE_PIN = A0;  // Connect sensor AO to A0
const int DRY_RAW = 12000;    // Calibrate using the raw value in dry soil/air
const int WET_RAW = 6000;     // Calibrate using the raw value in wet soil
const unsigned long SEND_INTERVAL_MS = 5000;

WiFiClient client;

int readMoistureRaw() {
  long total = 0;
  for (int sample = 0; sample < 10; sample++) {
    total += analogRead(MOISTURE_PIN);
    delay(10);
  }
  return total / 10;
}

int moisturePercent(int rawValue) {
  const long percent = map(rawValue, DRY_RAW, WET_RAW, 0, 100);
  return constrain(percent, 0, 100);
}

void connectToWiFi() {
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print("Connecting to Wi-Fi: ");
    Serial.println(WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    delay(5000);
  }
  Serial.print("Wi-Fi connected. Board IP: ");
  Serial.println(WiFi.localIP());
}

void sendReading(int moisture) {
  if (!client.connect(SERVER_IP, SERVER_PORT)) {
    Serial.println("Cannot reach dashboard. Check SERVER_IP and that server.py is running.");
    client.stop();
    return;
  }

  // The dashboard requires four moisture values. During this one-sensor test,
  // the same real reading is repeated; chemistry values below are placeholders.
  char body[160];
  const int bodyLength = snprintf(
    body,
    sizeof(body),
    "{\"moisture\":[%d,%d,%d,%d],\"ph\":6.4,\"n\":38,\"p\":21,\"k\":67}",
    moisture,
    moisture,
    moisture,
    moisture
  );
  if (bodyLength < 0 || bodyLength >= sizeof(body)) {
    client.stop();
    Serial.println("Could not format telemetry JSON.");
    return;
  }

  client.println("POST /api/telemetry HTTP/1.1");
  client.print("Host: ");
  client.print(SERVER_IP);
  client.print(':');
  client.println(SERVER_PORT);
  client.println("Content-Type: application/json");
  client.println("Connection: close");
  client.print("Content-Length: ");
  client.println(bodyLength);
  client.println();
  client.print(body);

  client.setTimeout(3000);
  const String response = client.readStringUntil('\n');
  Serial.print("Dashboard response: ");
  Serial.println(response);
  client.stop();
}

void setup() {
  Serial.begin(115200);
  const unsigned long serialWaitStarted = millis();
  while (!Serial && millis() - serialWaitStarted < 3000) {
    delay(10);
  }

  analogReadResolution(14);

  if (WiFi.status() == WL_NO_MODULE) {
    Serial.println("Wi-Fi module not found. Check the Arduino UNO R4 WiFi board.");
    while (true) delay(1000);
  }
  connectToWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  const int rawValue = readMoistureRaw();
  const int moisture = moisturePercent(rawValue);
  Serial.print("Moisture raw: ");
  Serial.print(rawValue);
  Serial.print(" | calibrated: ");
  Serial.print(moisture);
  Serial.println("%");

  sendReading(moisture);
  delay(SEND_INTERVAL_MS);
}
