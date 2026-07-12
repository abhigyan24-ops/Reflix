#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "mbedtls/md.h"

// --- PIN CONFIGURATION (LAYER 2A.6) ---
#define TRIG_PIN       5    // HC-SR04 trigger
#define ECHO_PIN       18   // HC-SR04 echo
#define IR_PIN         19   // TCRT5000
#define FLOW_PIN       21   // YF-S201 pulse
#define RELAY_PIN      22   // Solenoid relay
#define LCD_SDA        26   // I2C LCD SDA
#define LCD_SCL        27   // I2C LCD SCL
#define QR_RX          16   // GM65 QR RX (Connect to ESP32 TX2)
#define QR_TX          17   // GM65 QR TX (Connect to ESP32 RX2)

// --- STATE MACHINE STATES ---
enum DispenserState {
  STATE_IDLE,
  STATE_QR_SCAN,
  STATE_VALIDATING,
  STATE_DISPENSING,
  STATE_COMPLETE,
  STATE_ERROR
};

const char* stateNames[] = {
  "IDLE",
  "QR_SCAN",
  "VALIDATING",
  "DISPENSING",
  "COMPLETE",
  "ERROR"
};

// Global variables
volatile DispenserState currentState = STATE_IDLE;
volatile unsigned long pulseCount = 0;
unsigned long lastPulseTime = 0;
unsigned long stateTimer = 0;
unsigned long heartbeatTimer = 0;

// QR variables
String qrData = "";
String qrUid = "";
float qrAmount = 0.0;
unsigned long qrTimestamp = 0;
String qrNonce = "";
String qrSignature = "";

// Dispensation metrics
unsigned long targetPulses = 0;
float dispensedVolumeMl = 0.0;
float targetVolumeMl = 0.0;

// Device configurations
const char* machineId = "disp_001";
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqttServer = "broker.emqx.io"; // Default EMQX test broker
const int mqttPort = 8883;                 // TLS Port
const char* nvsSharedSecret = "refillx_edge_shared_secret";

// MOCK Root CA Certificate (DST Root CA X3 or Let's Encrypt ISRG Root X1 for EMQX Cloud)
const char* rootCACertificate = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIDSjCCAjKgAwIBAgIQRK+IaaQ/3QKVJQIHgRDeAjANBgkqhkiG9w0BAQsFADAv\n" \
"MS0wKwYDVQQDEyJJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4WhcNMzUwNjA0\n" \
"MTEwNDM4WjAvMS0wKwYDVQQDEyJJU1JHIFJvb3QgWDEwggEiMA0GCSqGSIb3DQE\n" \
"AQEFAAOCQ0IBDwAwggEKAoIBAQCzoDJgu2jvw255DxsLQQ5YQZpQYd+N9K/N2S3S\n" \
"hL7pY62V9Wkg/0L8S7M+Z8vE08e6jW+J8xQo/o/pL7T/45x4G8wQ7FqP+c9Wl1S3\n" \
"k/1/5iG7A6v5g+l2S2k/5/5iG7A6v5g+l2S2k/5/5iG7A6v5g+l2S2k/5/5iG7A6\n" \
"v5g+l2S2k/5/5iG7A6v5g+l2S2k/5/5iG7A6v5g+l2S2k/5/5iG7A6v5g+l2S2k\n" \
"-----END CERTIFICATE-----\n";

// Display Drivers
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_SSD1306 oled(128, 64, &Wire, -1);

WiFiClientSecure wifiSecureClient;
PubSubClient mqttClient(wifiSecureClient);

// --- INTERRUPT HANDLER (2A.4) ---
void IRAM_ATTR flowPulseCounter() {
  pulseCount++;
  lastPulseTime = millis();
}

// --- FUNCTION PROTOTYPES ---
void stateMachineTask(void* parameter);
void callback(char* topic, byte* payload, unsigned int length);
void updateDisplay(const char* line1, const char* line2);
void drawOledProgress(int percent);
void connectWiFi();
void connectMQTT();
bool verifyQRCode(String qrStr);
void computeHMAC(const char* message, const char* key, unsigned char* outputHmac);
bool constantTimeCompare(const char* a, const char* b, size_t length);
float getUltrasonicDistance();

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, QR_TX, QR_RX); // GM65 QR module uses Serial2
  
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(IR_PIN, INPUT);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Force closed

  // Initialize display
  Wire.begin();
  lcd.init();
  lcd.backlight();
  updateDisplay("RefillX Boot", "Initializing...");

  if (oled.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    oled.clearDisplay();
    oled.setTextSize(1);
    oled.setTextColor(SSD1306_WHITE);
    oled.display();
  }

  // Set interrupt for Flow sensor
  pinMode(FLOW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), flowPulseCounter, RISING);

  // Secure connection setup
  wifiSecureClient.setCACert(rootCACertificate);
  mqttClient.setServer(mqttServer, mqttPort);
  mqttClient.setCallback(callback);

  // WiFi Setup
  connectWiFi();

  // Create FreeRTOS task running Core 1 (2A.1)
  xTaskCreatePinnedToCore(
    stateMachineTask,
    "StateMachineTask",
    8192,
    NULL,
    1,
    NULL,
    1
  );
}

void loop() {
  // Keep connections alive (2A.2)
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  
  mqttClient.loop();
  
  // Publish status heartbeat every 30 seconds
  if (millis() - heartbeatTimer > 30000) {
    heartbeatTimer = millis();
    if (mqttClient.connected()) {
      StaticJsonDocument<128> doc;
      doc["status"] = stateNames[currentState];
      doc["stockLevel"] = 82; // Mock stock level
      doc["uptime"] = millis() / 1000;
      char buffer[128];
      serializeJson(doc, buffer);
      
      String topic = String("refillx/dispensers/") + machineId + "/status";
      mqttClient.publish(topic.c_str(), buffer, true);
    }
  }

  vTaskDelay(pdMS_TO_TICKS(100));
}

// --- STATE MACHINE TASK (2A.1) ---
void stateMachineTask(void* parameter) {
  DispenserState lastPrintedState = STATE_ERROR;
  
  for(;;) {
    if (currentState != lastPrintedState) {
      Serial.printf("[STATE CHANGE] %s -> %s\n", stateNames[lastPrintedState], stateNames[currentState]);
      lastPrintedState = currentState;
      stateTimer = millis();
    }

    switch(currentState) {
      
      case STATE_IDLE:
        updateDisplay("RefillX Ready", "Place bottle");
        
        // Polling ultrasonic + IR (Transition rule: IDLE -> QR_SCAN)
        if (getUltrasonicDistance() <= 15.0 && digitalRead(IR_PIN) == LOW) {
          currentState = STATE_QR_SCAN;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
        break;

      case STATE_QR_SCAN:
        updateDisplay("Scan QR Code", "Waiting...");
        
        // Read serial data from GM65 QR module
        if (Serial2.available() > 0) {
          qrData = Serial2.readStringUntil('\n');
          qrData.trim();
          Serial.println("QR Scanner Input: " + qrData);
          
          if (verifyQRCode(qrData)) {
            currentState = STATE_VALIDATING;
          } else {
            currentState = STATE_ERROR;
            // Publish Alert
            StaticJsonDocument<128> doc;
            doc["type"] = "tamper";
            doc["timestamp"] = millis() / 1000;
            char buffer[128];
            serializeJson(doc, buffer);
            String topic = String("refillx/dispensers/") + machineId + "/alert";
            mqttClient.publish(topic.c_str(), buffer);
          }
        }
        
        // Timeout check (30s)
        if (millis() - stateTimer > 30000) {
          Serial.println("QR Scanner Timeout.");
          currentState = STATE_ERROR;
        }
        break;

      case STATE_VALIDATING:
        updateDisplay("Validating...", "Please wait");
        
        // Publish start to MQTT (2A.2)
        if (millis() - stateTimer < 100) { // Execute once on enter state
          StaticJsonDocument<128> doc;
          doc["uid"] = qrUid;
          doc["machineId"] = machineId;
          doc["timestamp"] = qrTimestamp;
          doc["nonce"] = qrNonce;
          char buffer[128];
          serializeJson(doc, buffer);
          String topic = String("refillx/dispensers/") + machineId + "/dispense/start";
          mqttClient.publish(topic.c_str(), buffer);
        }

        // Transition logic is handled by MQTT callback (action: open -> dispensing)
        // Check timeout (10s)
        if (millis() - stateTimer > 10000) {
          Serial.println("Validation Timeout.");
          currentState = STATE_ERROR;
        }
        break;

      case STATE_DISPENSING:
        digitalWrite(RELAY_PIN, HIGH); // OPEN solenoid valve
        
        // Calculate dispensed volume (Calibration: 450 pulses = 1L)
        dispensedVolumeMl = (pulseCount / 450.0) * 1000.0;
        
        // Update LCD
        {
          char l2[16];
          snprintf(l2, sizeof(l2), "%.0fml / %.0fml", dispensedVolumeMl, targetVolumeMl);
          updateDisplay("Dispensing...", l2);
        }

        // Update OLED progress bar
        {
          int pct = (dispensedVolumeMl / targetVolumeMl) * 100;
          drawOledProgress(min(pct, 100));
        }

        // Transition: target reached
        if (pulseCount >= targetPulses) {
          currentState = STATE_COMPLETE;
        }

        // Transition: valve jam (no pulse for 5s)
        if (millis() - lastPulseTime > 5000 && pulseCount > 0) {
          Serial.println("ERROR: Valve jam detected (No pulses for 5s)");
          currentState = STATE_ERROR;
          // Publish alert
          StaticJsonDocument<128> doc;
          doc["type"] = "valve_jam";
          doc["timestamp"] = millis() / 1000;
          char buffer[128];
          serializeJson(doc, buffer);
          String topic = String("refillx/dispensers/") + machineId + "/alert";
          mqttClient.publish(topic.c_str(), buffer);
        }

        // Transition: bottle removed (IR goes HIGH)
        if (digitalRead(IR_PIN) == HIGH) {
          Serial.println("ERROR: Bottle removed during dispense");
          currentState = STATE_ERROR;
        }
        break;

      case STATE_COMPLETE:
        digitalWrite(RELAY_PIN, LOW); // CLOSE solenoid valve
        
        // Update LCD
        {
          char l2[16];
          snprintf(l2, sizeof(l2), "%.0fml dispensed", dispensedVolumeMl);
          updateDisplay("Done!", l2);
        }

        // Publish complete to MQTT (2A.2)
        if (millis() - stateTimer < 100) {
          StaticJsonDocument<128> doc;
          doc["uid"] = qrUid;
          doc["machineId"] = machineId;
          doc["volume"] = (int)dispensedVolumeMl;
          doc["timestamp"] = millis() / 1000;
          char buffer[128];
          serializeJson(doc, buffer);
          String topic = String("refillx/dispensers/") + machineId + "/dispense/complete";
          mqttClient.publish(topic.c_str(), buffer);
        }

        // Complete delay -> IDLE (3s)
        if (millis() - stateTimer > 3000) {
          currentState = STATE_IDLE;
        }
        break;

      case STATE_ERROR:
        digitalWrite(RELAY_PIN, LOW); // CLOSE solenoid safety valve
        updateDisplay("Error!", "Device Resetting");
        
        // Error delay -> IDLE (30s)
        if (millis() - stateTimer > 30000) {
          currentState = STATE_IDLE;
        }
        break;
    }

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

// --- Wi-Fi Reconnection with Exponential Backoff (2A.2) ---
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  int delayTime = 1000;
  
  while (WiFi.status() != WL_CONNECTED && attempts < 5) {
    WiFi.begin(ssid, password);
    attempts++;
    Serial.printf("\nAttempt %d...", attempts);
    
    // Non-blocking wait for connection
    long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 5000) {
      delay(100);
    }
    
    if (WiFi.status() != WL_CONNECTED) {
      delay(delayTime);
      delayTime *= 2; // Exponential backoff
    }
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
  } else {
    Serial.println("\nWiFi Connection Failed. Proceeding in offline mode.");
  }
}

// --- MQTT Connection with 5s retry (2A.2) ---
void connectMQTT() {
  if (mqttClient.connected()) return;
  
  String clientId = String("refillx-") + machineId;
  Serial.printf("Connecting to MQTT Server as client: %s\n", clientId.c_str());
  
  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("Connected to EMQX Broker!");
    String topic = String("refillx/dispensers/") + machineId + "/command";
    mqttClient.subscribe(topic.c_str(), 1); // QoS 1
  } else {
    Serial.printf("MQTT Connection failed, rc=%d. Will retry in 5s\n", mqttClient.state());
  }
}

// --- MQTT CALLBACKS (2A.1) ---
void callback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("Command payload arrived: [%s]\n", topic);
  
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.println("JSON parse failed");
    return;
  }

  if (currentState == STATE_VALIDATING) {
    const char* action = doc["action"];
    if (strcmp(action, "open") == 0) {
      // Calculate calibration target pulses
      float requestedAmount = doc["amount"]; // in ml
      targetVolumeMl = requestedAmount;
      targetPulses = (requestedAmount / 1000.0) * 450.0;
      
      pulseCount = 0; // Clear counters
      lastPulseTime = millis();
      currentState = STATE_DISPENSING;
      Serial.println("Dispense Authorized by Cloud!");
    } 
    else if (strcmp(action, "reject") == 0) {
      currentState = STATE_ERROR;
      Serial.println("Dispense Rejected by Cloud!");
    }
  }
}

// --- HMAC SHA256 VALIDATOR (2A.3) ---
bool verifyQRCode(String qrStr) {
  // Format: uid:amount:machineId:timestamp:nonce:signature
  int first = qrStr.indexOf(':');
  int second = qrStr.indexOf(':', first + 1);
  int third = qrStr.indexOf(':', second + 1);
  int fourth = qrStr.indexOf(':', third + 1);
  int fifth = qrStr.indexOf(':', fourth + 1);
  
  if (first == -1 || second == -1 || third == -1 || fourth == -1 || fifth == -1) {
    Serial.println("Invalid QR format delimiters");
    return false;
  }
  
  qrUid = qrStr.substring(0, first);
  qrAmount = qrStr.substring(first + 1, second).toFloat();
  String qrMid = qrStr.substring(second + 1, third);
  qrTimestamp = qrStr.substring(third + 1, fourth).toInt();
  qrNonce = qrStr.substring(fourth + 1, fifth);
  qrSignature = qrStr.substring(fifth + 1);
  
  // 1. Verify machineId
  if (qrMid != machineId) {
    Serial.println("Machine ID mismatch");
    return false;
  }
  
  // 2. Verify timestamp (TTL 90 seconds)
  unsigned long nowSec = millis() / 1000; // Mock current time offset
  // Real implementation: get NTP epoch or timestamp difference
  // For the simulator validation check:
  if (qrTimestamp == 0) {
    Serial.println("Invalid timestamp 0");
    return false;
  }

  // 3. Compute HMAC
  String message = qrStr.substring(0, fifth); // Part before signature
  unsigned char computedHmac[32];
  computeHMAC(message.c_str(), nvsSharedSecret, computedHmac);
  
  char computedHmacHex[65];
  for (int i = 0; i < 32; i++) {
    sprintf(&computedHmacHex[i * 2], "%02x", computedHmac[i]);
  }
  computedHmacHex[64] = '\0';
  
  // 4. Constant-Time comparison (2A.3)
  return constantTimeCompare(computedHmacHex, qrSignature.c_str(), 64);
}

void computeHMAC(const char* message, const char* key, unsigned char* outputHmac) {
  mbedtls_md_context_t ctx;
  mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;
  
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key, strlen(key));
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)message, strlen(message));
  mbedtls_md_hmac_finish(&ctx, outputHmac);
  mbedtls_md_free(&ctx);
}

bool constantTimeCompare(const char* a, const char* b, size_t length) {
  unsigned char result = 0;
  for (size_t i = 0; i < length; i++) {
    result |= a[i] ^ b[i];
  }
  return result == 0;
}

// --- SENSOR MOCK READERS (2A.1) ---
float getUltrasonicDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms timeout
  if (duration == 0) return 999.0;                // Return out of range
  return duration * 0.034 / 2.0;
}

// --- DISPLAY RENDERERS (2A.5) ---
void updateDisplay(const char* line1, const char* line2) {
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print(line1);
  lcd.setCursor(0,1);
  lcd.print(line2);
  
  // Sync to Serial
  Serial.printf("[LCD DISPLAY] %-16s | %-16s\n", line1, line2);
}

void drawOledProgress(int percent) {
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  
  oled.setCursor(0, 5);
  oled.print("Dispensing Water...");
  
  // Draw border outline
  oled.drawRect(0, 30, 128, 15, SSD1306_WHITE);
  
  // Fill progress bar width
  int progressWidth = (percent / 100.0) * 124.0;
  oled.fillRect(2, 32, progressWidth, 11, SSD1306_WHITE);
  
  oled.setCursor(0, 52);
  oled.printf("Progress: %d%%", percent);
  
  oled.display();
}
