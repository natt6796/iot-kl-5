// USB connection test for the dashboard. This sends example values, not sensor readings.
// Replace the values in the JSON line with calibrated readings from your sensors.

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println("{\"moisture\":[61,55,68,47],\"ph\":6.4,\"n\":38,\"p\":21,\"k\":67}");
  delay(2000);
}
