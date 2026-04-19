#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ---- Config ----
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_HOST = "192.168.1.50"; // IP du serveur Node
const uint16_t SERVER_PORT = 5174;
const char* DEVICE_ID = "bt-buzzer-01";
const char* DEVICE_SECRET = "change_me_for_esp32";
const char* GAME_ID = "AB12CD";
const char* FIRMWARE_VERSION = "1.0.0";

// ---- Pins ----
const int BUTTON_PIN = 18;
const int LED_GREEN = 26;
const int LED_RED = 27;
const int SPEAKER_PIN = 25;

WebSocketsClient webSocket;
unsigned long lastHeartbeatMs = 0;
unsigned long lastPressMs = 0;
bool speakerEnabled = true;
bool speakerMuted = false;

void setIdle() {
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);
}

void flashGreen(int ms) {
  digitalWrite(LED_GREEN, HIGH);
  delay(ms);
  digitalWrite(LED_GREEN, LOW);
}

void flashRed(int ms) {
  digitalWrite(LED_RED, HIGH);
  delay(ms);
  digitalWrite(LED_RED, LOW);
}

void beepTone(int frequency, int durationMs) {
  if (!speakerEnabled || speakerMuted) return;
  tone(SPEAKER_PIN, frequency, durationMs);
  delay(durationMs);
  noTone(SPEAKER_PIN);
}

void beepShort() {
  beepTone(2200, 120);
}

void beepLong() {
  beepTone(1800, 320);
}

void sendDeviceHello() {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["secret"] = DEVICE_SECRET;
  doc["name"] = "Buzzer ESP32";
  doc["firmware"] = FIRMWARE_VERSION;

  String payload;
  serializeJson(doc, payload);
  webSocket.sendTXT("42[\"device:hello\"," + payload + "]");
}

void sendHeartbeat() {
  StaticJsonDocument<128> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["rssi"] = WiFi.RSSI();
  String payload;
  serializeJson(doc, payload);
  webSocket.sendTXT("42[\"device:heartbeat\"," + payload + "]");
}

void sendBuzzerPress() {
  StaticJsonDocument<192> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["gameId"] = GAME_ID;
  doc["pressedAt"] = (uint32_t) millis();
  String payload;
  serializeJson(doc, payload);
  webSocket.sendTXT("42[\"buzzer:press\"," + payload + "]");
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      sendDeviceHello();
      break;
    case WStype_TEXT: {
      String msg = String((char*)payload).substring(0, length);
      // Réponse ack Socket.IO simplifiée: en V1 on se base sur success/error dans le texte
      if (msg.indexOf("\"success\":true") >= 0) {
        flashGreen(150);
        beepShort();
      } else if (msg.indexOf("\"success\":false") >= 0) {
        flashRed(150);
      }
      if (msg.indexOf("\"device:speaker\"") >= 0) {
        if (msg.indexOf("\"speakerEnabled\":false") >= 0) speakerEnabled = false;
        if (msg.indexOf("\"speakerEnabled\":true") >= 0) speakerEnabled = true;
        if (msg.indexOf("\"speakerMuted\":true") >= 0) speakerMuted = true;
        if (msg.indexOf("\"speakerMuted\":false") >= 0) speakerMuted = false;
        if (msg.indexOf("\"command\":\"test\"") >= 0) {
          if (msg.indexOf("\"pattern\":\"long\"") >= 0) beepLong();
          else beepShort();
        }
      }
      if (msg.indexOf("\"device:led\"") >= 0) {
        if (msg.indexOf("\"pattern\":\"success\"") >= 0) flashGreen(200);
        else if (msg.indexOf("\"pattern\":\"error\"") >= 0) flashRed(200);
        else {
          flashGreen(120);
          delay(100);
          flashRed(120);
        }
      }
      break;
    }
    case WStype_DISCONNECTED:
      setIdle();
      break;
    default:
      break;
  }
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(SPEAKER_PIN, OUTPUT);
  setIdle();

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  // Namespace Socket.IO /devices -> chemin /socket.io/?EIO=4&transport=websocket
  webSocket.begin(SERVER_HOST, SERVER_PORT, "/socket.io/?EIO=4&transport=websocket");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  webSocket.loop();

  // Heartbeat toutes les 4s
  if (millis() - lastHeartbeatMs > 4000) {
    lastHeartbeatMs = millis();
    sendHeartbeat();
  }

  // Debounce simple bouton
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed && (millis() - lastPressMs > 250)) {
    lastPressMs = millis();
    sendBuzzerPress();
  }
}
