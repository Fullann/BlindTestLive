/**
 * firmware-esp32-provisioning.ino
 * ================================
 * Firmware complet pour les totems BlindTestLive (ESP32).
 *
 * FONCTIONNALITÉS
 * ───────────────
 * • Provisioning USB : branchez le totem, ouvrez /admin/hardware/provision
 *   dans Chrome/Edge et envoyez la config en un clic.
 * • Stockage NVRAM   : la config est persistée en flash via la bibliothèque
 *   Preferences ; le totem se souvient de tout après coupure d'alimentation.
 * • Connexion WiFi   : connexion automatique avec reconnexion toutes les 10 s.
 * • Socket.IO        : le totem s'enregistre sur le namespace /devices du
 *   serveur BlindTestLive et envoie les appuis de bouton.
 * • LED              : feedback visuel vert/rouge sur appui et retour serveur.
 * • Haut-parleur     : bip sur buzz réussi/échoué, contrôlable depuis l'app.
 *
 * CÂBLAGE MINIMUM
 * ───────────────
 *   GPIO 0  → bouton (autre borne → GND)
 *   GPIO 2  → LED verte (+ résistance 220 Ω → GND)
 *   GPIO 4  → LED rouge (+ résistance 220 Ω → GND)
 *   GPIO 25 → haut-parleur passif (autre borne → GND)
 *
 * DÉPENDANCES ARDUINO
 * ───────────────────
 *   • ArduinoJson  ≥ 6.21  (Benoit Blanchon)
 *   • WebSockets   ≥ 2.4   (Markus Sattler)  bibliothèque : "WebSockets"
 *   • Preferences  (intégrée ESP32 Arduino core)
 *
 * PROVISIONING
 * ────────────
 * 1. Flashez ce firmware via Arduino IDE ou PlatformIO.
 * 2. Branchez le totem en USB.
 * 3. Ouvrez Chrome sur http://<serveur>/admin/hardware/provision
 * 4. Cliquez "Connecter le totem", sélectionnez le port série.
 * 5. Renseignez le WiFi et cliquez "Envoyer la configuration".
 * 6. Le totem redémarre et se connecte automatiquement.
 *
 * MODE RESET CONFIG
 * ─────────────────
 * Maintenez le bouton appuyé pendant 5 s au démarrage → la config est effacée
 * et le totem attend une nouvelle configuration via USB.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>

/* ─── Pins ─────────────────────────────────────────────────── */
#define BTN_PIN      0    // bouton buzz
#define LED_GREEN    2    // LED verte
#define LED_RED      4    // LED rouge
#define SPEAKER_PIN  25   // haut-parleur passif

/* ─── Timing ────────────────────────────────────────────────── */
#define WIFI_RETRY_MS    10000UL   // tentative de reconnexion WiFi
#define WS_RECONNECT_MS   5000UL   // tentative de reconnexion WebSocket
#define HEARTBEAT_MS     15000UL   // intervalle heartbeat vers serveur
#define BTN_DEBOUNCE_MS     80UL   // anti-rebond bouton
#define RESET_HOLD_MS     5000UL   // maintien pour reset config

/* ─── Config persistante ────────────────────────────────────── */
Preferences prefs;
String cfgSsid, cfgPassword, cfgHost, cfgDeviceId, cfgSecret;
int    cfgPort = 5174;
bool   provisioned = false;

/* ─── État runtime ─────────────────────────────────────────── */
WebSocketsClient ws;
bool wsConnected    = false;
bool speakerEnabled = true;
bool speakerMuted   = false;

unsigned long lastWiFiRetry  = 0;
unsigned long lastHeartbeat  = 0;
unsigned long lastBtnRelease = 0;
bool          btnWasPressed  = false;

/* ════════════════════════════════════════════════════════════ */
/*                      NVRAM helpers                           */
/* ════════════════════════════════════════════════════════════ */

void loadConfig() {
  prefs.begin("blindtest", true);  // read-only
  cfgSsid     = prefs.getString("ssid",     "");
  cfgPassword = prefs.getString("password", "");
  cfgHost     = prefs.getString("host",     "");
  cfgPort     = prefs.getInt   ("port",     5174);
  cfgDeviceId = prefs.getString("deviceId", "");
  cfgSecret   = prefs.getString("secret",   "");
  prefs.end();

  provisioned = cfgSsid.length() > 0 && cfgHost.length() > 0 && cfgDeviceId.length() > 0;
}

void saveConfig(const String& ssid, const String& pass,
                const String& host, int port,
                const String& deviceId, const String& secret) {
  prefs.begin("blindtest", false);  // read-write
  prefs.putString("ssid",     ssid);
  prefs.putString("password", pass);
  prefs.putString("host",     host);
  prefs.putInt   ("port",     port);
  prefs.putString("deviceId", deviceId);
  prefs.putString("secret",   secret);
  prefs.end();
  Serial.println("[NVRAM] Configuration sauvegardée.");
}

void clearConfig() {
  prefs.begin("blindtest", false);
  prefs.clear();
  prefs.end();
  Serial.println("[NVRAM] Configuration effacée.");
}

/* ════════════════════════════════════════════════════════════ */
/*                    LED / Speaker helpers                     */
/* ════════════════════════════════════════════════════════════ */

void ledOff() {
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED,   LOW);
}

void flashGreen(int times = 1, int ms = 150) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_GREEN, HIGH); delay(ms);
    digitalWrite(LED_GREEN, LOW);  if (i < times - 1) delay(ms / 2);
  }
}

void flashRed(int times = 1, int ms = 150) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_RED, HIGH); delay(ms);
    digitalWrite(LED_RED, LOW);  if (i < times - 1) delay(ms / 2);
  }
}

void blink(int times = 3) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_GREEN, HIGH); digitalWrite(LED_RED, HIGH); delay(100);
    ledOff(); delay(100);
  }
}

void beep(int freq = 1000, int durationMs = 100) {
  if (!speakerEnabled || speakerMuted) return;
  tone(SPEAKER_PIN, freq, durationMs);
  delay(durationMs + 10);
  noTone(SPEAKER_PIN);
}

void beepSuccess() { beep(1200, 80); delay(60); beep(1600, 120); }
void beepFail()    { beep(400, 200); }
void beepReady()   { beep(800, 60); delay(40); beep(1000, 60); delay(40); beep(1200, 80); }

/* ════════════════════════════════════════════════════════════ */
/*                  Provisioning via Serial USB                 */
/* ════════════════════════════════════════════════════════════ */

String serialBuffer = "";

/**
 * Lit une ligne JSON sur le port série et tente de la parser comme
 * commande de provisioning.
 *
 * Format attendu (envoyé par la page HardwareProvision.tsx) :
 * {"cmd":"provision","ssid":"...","password":"...","host":"...","port":5174,"deviceId":"...","secret":"..."}
 */
void handleSerialProvisioning() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      serialBuffer.trim();
      if (serialBuffer.length() > 0) {
        StaticJsonDocument<512> doc;
        DeserializationError err = deserializeJson(doc, serialBuffer);
        if (!err && doc["cmd"] == "provision") {
          String ssid     = doc["ssid"]     | "";
          String pass     = doc["password"] | "";
          String host     = doc["host"]     | "";
          int    port     = doc["port"]     | 5174;
          String deviceId = doc["deviceId"] | "";
          String secret   = doc["secret"]   | "";

          Serial.println("[PROV] Commande de provisioning reçue.");
          Serial.printf ("  SSID     : %s\n", ssid.c_str());
          Serial.printf ("  Host     : %s:%d\n", host.c_str(), port);
          Serial.printf ("  DeviceID : %s\n", deviceId.c_str());

          if (ssid.length() == 0 || host.length() == 0 || deviceId.length() == 0) {
            Serial.println("[PROV] Erreur : ssid, host et deviceId sont obligatoires.");
          } else {
            saveConfig(ssid, pass, host, port, deviceId, secret);
            Serial.println("[PROV] Config OK – redémarrage dans 2 s…");
            blink(3);
            delay(2000);
            ESP.restart();
          }
        } else if (!err) {
          Serial.printf("[SERIAL] Commande inconnue : %s\n", doc["cmd"].as<const char*>());
        } else {
          Serial.printf("[SERIAL] JSON invalide : %s\n", err.c_str());
        }
        serialBuffer = "";
      }
    } else {
      serialBuffer += c;
    }
  }
}

/* ════════════════════════════════════════════════════════════ */
/*                     WiFi helpers                             */
/* ════════════════════════════════════════════════════════════ */

void connectWiFi() {
  Serial.printf("[WiFi] Connexion à %s…\n", cfgSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfgSsid.c_str(), cfgPassword.c_str());

  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 12000) {
    delay(300);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Connecté – IP : %s\n", WiFi.localIP().toString().c_str());
    flashGreen(3, 100);
  } else {
    Serial.println("[WiFi] Échec de connexion.");
    flashRed(3, 100);
  }
}

/* ════════════════════════════════════════════════════════════ */
/*                  Socket.IO / WebSocket                       */
/* ════════════════════════════════════════════════════════════ */

void sendSocketEvent(const char* event, JsonDocument& payload) {
  if (!wsConnected) return;
  String out;
  StaticJsonDocument<256> wrapper;
  wrapper[0] = event;
  wrapper[1] = payload;
  serializeJson(wrapper, out);
  // Format Socket.IO : "42" + JSON_array
  String msg = "42" + out;
  ws.sendTXT(msg);
}

void onDeviceHello() {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = cfgDeviceId;
  doc["secret"]   = cfgSecret;
  doc["firmware"] = "1.3.0";
  sendSocketEvent("device:hello", doc);
  Serial.println("[WS] device:hello envoyé.");
}

void onBuzz() {
  if (!wsConnected) { flashRed(2); beepFail(); return; }
  StaticJsonDocument<128> doc;
  doc["deviceId"] = cfgDeviceId;
  sendSocketEvent("buzzer:press", doc);
  flashGreen();
  beepSuccess();
  Serial.println("[WS] buzzer:press envoyé.");
}

void handleServerMessage(const String& payload) {
  // Socket.IO data frames start with "42"
  if (!payload.startsWith("42")) return;
  String json = payload.substring(2);

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, json)) return;

  const char* event = doc[0];
  JsonObject  data  = doc[1];

  /* ── LED test ── */
  if (strcmp(event, "device:led") == 0) {
    const char* pattern = data["pattern"] | "blink";
    if      (strcmp(pattern, "success") == 0) flashGreen(2);
    else if (strcmp(pattern, "error")   == 0) flashRed(2);
    else                                      blink(3);
  }

  /* ── Speaker control ── */
  else if (strcmp(event, "device:speaker") == 0) {
    const char* cmd = data["cmd"] | "";
    if (strcmp(cmd, "enable") == 0) {
      speakerEnabled = data["value"] | true;
      Serial.printf("[SPK] enabled=%d\n", speakerEnabled);
    } else if (strcmp(cmd, "mute") == 0) {
      speakerMuted = data["value"] | false;
      Serial.printf("[SPK] muted=%d\n", speakerMuted);
    } else if (strcmp(cmd, "test") == 0) {
      beepReady();
    }
  }

  /* ── Buzz feedback from server ── */
  else if (strcmp(event, "buzz:result") == 0) {
    bool success = data["success"] | false;
    if (success) { flashGreen(2); beepSuccess(); }
    else          { flashRed(1);  beepFail();    }
  }
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println("[WS] Connecté au serveur.");
      beepReady();
      flashGreen(2, 200);
      onDeviceHello();
      break;

    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WS] Déconnecté.");
      break;

    case WStype_TEXT: {
      String msg((char*)payload, length);
      // Ping/pong Socket.IO
      if (msg == "2")  { ws.sendTXT("3"); break; }
      if (msg == "40") break; // namespace connect ack
      handleServerMessage(msg);
      break;
    }

    default: break;
  }
}

void connectWebSocket() {
  Serial.printf("[WS] Connexion à %s:%d/devices\n", cfgHost.c_str(), cfgPort);
  ws.begin(cfgHost.c_str(), cfgPort, "/devices/socket.io/?EIO=4&transport=websocket");
  ws.onEvent(webSocketEvent);
  ws.setReconnectInterval(WS_RECONNECT_MS);
}

/* ════════════════════════════════════════════════════════════ */
/*                           SETUP                             */
/* ════════════════════════════════════════════════════════════ */

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[BOOT] Totem BlindTestLive v1.3.0");

  pinMode(BTN_PIN,    INPUT_PULLUP);
  pinMode(LED_GREEN,  OUTPUT);
  pinMode(LED_RED,    OUTPUT);
  ledOff();

  /* ── Détection maintien bouton pour reset config ── */
  if (digitalRead(BTN_PIN) == LOW) {
    Serial.println("[BOOT] Bouton maintenu – reset config dans 5 s… (relâchez pour annuler)");
    unsigned long t = millis();
    while (digitalRead(BTN_PIN) == LOW) {
      digitalWrite(LED_RED, (millis() / 200) % 2);  // clignotement rouge
      if (millis() - t > RESET_HOLD_MS) {
        ledOff();
        clearConfig();
        flashRed(5, 100);
        break;
      }
    }
    ledOff();
  }

  /* ── Chargement config NVRAM ── */
  loadConfig();

  if (!provisioned) {
    Serial.println("[BOOT] Aucune configuration – mode attente provisioning USB.");
    Serial.println("[BOOT] Envoyez la config depuis /admin/hardware/provision dans Chrome.");
    blink(2);
    return;  // on reste dans le loop en mode provisioning uniquement
  }

  /* ── WiFi ── */
  connectWiFi();

  /* ── WebSocket ── */
  if (WiFi.status() == WL_CONNECTED) {
    connectWebSocket();
  }
}

/* ════════════════════════════════════════════════════════════ */
/*                            LOOP                             */
/* ════════════════════════════════════════════════════════════ */

void loop() {
  /* Toujours écouter le Serial pour provisioning (même après config) */
  handleSerialProvisioning();

  if (!provisioned) {
    delay(20);
    return;
  }

  /* ── Reconnexion WiFi ── */
  if (WiFi.status() != WL_CONNECTED) {
    unsigned long now = millis();
    if (now - lastWiFiRetry > WIFI_RETRY_MS) {
      lastWiFiRetry = now;
      Serial.println("[WiFi] Reconnexion…");
      connectWiFi();
      if (WiFi.status() == WL_CONNECTED && !wsConnected) connectWebSocket();
    }
  }

  /* ── WebSocket loop ── */
  ws.loop();

  /* ── Heartbeat ── */
  if (wsConnected) {
    unsigned long now = millis();
    if (now - lastHeartbeat > HEARTBEAT_MS) {
      lastHeartbeat = now;
      StaticJsonDocument<128> doc;
      doc["deviceId"] = cfgDeviceId;
      doc["rssi"]     = WiFi.RSSI();
      sendSocketEvent("device:heartbeat", doc);
    }
  }

  /* ── Bouton (anti-rebond) ── */
  bool btnDown = (digitalRead(BTN_PIN) == LOW);
  if (btnDown && !btnWasPressed) {
    unsigned long now = millis();
    if (now - lastBtnRelease > BTN_DEBOUNCE_MS) {
      btnWasPressed  = true;
      lastBtnRelease = now;
      onBuzz();
    }
  }
  if (!btnDown && btnWasPressed) {
    btnWasPressed = false;
  }

  delay(5);
}
