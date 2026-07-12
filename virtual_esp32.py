import asyncio
import json
import time
import sys
import random
import paho.mqtt.client as mqtt
import numpy as np

# MQTT Setup
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883  # Public WebSocket uses 8083, Python script uses TCP port 1883
MACHINE_ID = "sim-001"

# Topics
TOPIC_COMMAND = f"refillx/dispensers/{MACHINE_ID}/command"
TOPIC_STATUS = f"refillx/dispensers/{MACHINE_ID}/status"
TOPIC_START = f"refillx/dispensers/{MACHINE_ID}/dispense/start"
TOPIC_COMPLETE = f"refillx/dispensers/{MACHINE_ID}/dispense/complete"
TOPIC_ALERT = f"refillx/dispensers/{MACHINE_ID}/alert"
TOPIC_ERROR_INJECT = "refillx/sim/inject_error"

# State Constants
STATE_IDLE = "IDLE"
STATE_QR_SCAN = "QR_SCAN"
STATE_VALIDATING = "VALIDATING"
STATE_DISPENSING = "DISPENSING"
STATE_COMPLETE = "COMPLETE"
STATE_ERROR = "ERROR"

# Global Sim State
current_state = STATE_IDLE
target_volume = 500  # Default 500ml
dispensed_volume = 0.0
sim_running = False
uptime_start = time.time()
active_error = None

# Create client
client = mqtt.Client(client_id=f"refillx-{MACHINE_ID}")

# Safe support for Paho-MQTT v2
try:
    from paho.mqtt.enums import CallbackAPIVersion
    client = mqtt.Client(CallbackAPIVersion.VERSION1, client_id=f"refillx-{MACHINE_ID}")
except Exception:
    pass

def publish_status(state, flow_rate=0.0, distance=15.0, temp=24.0, tank_level=85.0, tds=120.0):
    payload = {
        "status": state,
        "flowRate": round(flow_rate, 2),
        "distance": round(distance, 2),
        "temperature": round(temp, 2),
        "tankLevel": round(tank_level, 1),
        "tds": round(tds, 1),
        "volume": int(dispensed_volume),
        "targetVolume": target_volume,
        "uptime": int(time.time() - uptime_start),
        "error": active_error
    }
    client.publish(TOPIC_STATUS, json.dumps(payload), qos=1)
    print(f"[Heartbeat] State: {state} | Telemetry: {payload}")

async def run_dispense_cycle(amount, uid, nonce=""):
    global current_state, dispensed_volume, target_volume, sim_running
    sim_running = True
    target_volume = amount
    dispensed_volume = 0.0
    if not nonce:
        nonce = f"sim_nonce_{random.randint(100000, 999999)}"

    print(f"\n--- Beginning Dispense Cycle: {amount}ml for user {uid} (Nonce: {nonce}) ---")
    
    # IDLE -> QR_SCAN (2s)
    current_state = STATE_QR_SCAN
    publish_status(current_state, distance=8.0)
    await asyncio.sleep(2.0)
    if active_error: return

    # QR_SCAN -> VALIDATING (1.5s)
    current_state = STATE_VALIDATING
    publish_status(current_state, distance=8.0)
    # Publish start topic
    client.publish(TOPIC_START, json.dumps({
        "uid": uid,
        "machineId": MACHINE_ID,
        "timestamp": int(time.time()),
        "nonce": nonce
    }), qos=1)
    await asyncio.sleep(1.5)
    if active_error: return

    # VALIDATING -> DISPENSING (5s total, updates every 500ms)
    current_state = STATE_DISPENSING
    total_steps = 10
    step_duration = 0.5
    volume_increment = target_volume / total_steps

    for step in range(total_steps):
        if active_error:
            return  # Exit if error injected
            
        dispensed_volume += volume_increment
        
        # Gaussian readings with anomaly injection
        flow_rate = np.random.normal(2.5, 0.3)
        distance = np.random.normal(8.0, 0.5)
        temp = np.random.normal(24.0, 0.2)
        tank_level = max(10.0, 85.0 - (dispensed_volume / target_volume) * 15.0)
        tds = np.random.normal(120.0, 8.0)
        
        publish_status(current_state, flow_rate=flow_rate, distance=distance, temp=temp, tank_level=tank_level, tds=tds)
        await asyncio.sleep(step_duration)

    # DISPENSING -> COMPLETE
    current_state = STATE_COMPLETE
    publish_status(current_state, distance=8.0)
    
    # Publish complete
    client.publish(TOPIC_COMPLETE, json.dumps({
        "uid": uid,
        "machineId": MACHINE_ID,
        "volume": int(dispensed_volume),
        "timestamp": int(time.time())
    }), qos=1)
    
    await asyncio.sleep(3.0)
    
    # Return to IDLE
    current_state = STATE_IDLE
    publish_status(current_state)
    sim_running = False
    print("--- Dispense Cycle Complete ---\n")

def on_connect(client, userdata, flags, rc):
    print(f"Connected to EMQX Broker with result code: {rc}")
    client.subscribe(TOPIC_COMMAND)
    client.subscribe(TOPIC_ERROR_INJECT)
    print(f"Subscribed to: {TOPIC_COMMAND} & {TOPIC_ERROR_INJECT}")

def on_message(client, userdata, msg):
    global current_state, active_error, sim_running
    payload_str = msg.payload.decode()
    print(f"Received message on {msg.topic}: {payload_str}")
    
    try:
        data = json.loads(payload_str)
        
        if msg.topic == TOPIC_COMMAND:
            # Handle start_simulation command
            if data.get("command") == "start_simulation" and not sim_running:
                amount = data.get("amount", 500)
                uid = data.get("uid", "sim_user")
                nonce = data.get("nonce", "")
                # Run the dispense cycle in the asyncio loop
                asyncio.run_coroutine_threadsafe(run_dispense_cycle(amount, uid, nonce), main_loop)
            elif data.get("command") == "reset":
                active_error = None
                current_state = STATE_IDLE
                sim_running = False
                publish_status(current_state)
                print("[Reset] Device returned to IDLE state.")
                
        elif msg.topic == TOPIC_ERROR_INJECT:
            err_type = data.get("type")
            if err_type:
                active_error = err_type
                current_state = STATE_ERROR
                publish_status(current_state)
                # Publish Alert
                client.publish(TOPIC_ALERT, json.dumps({
                    "type": err_type,
                    "timestamp": int(time.time())
                }), qos=1)
                print(f"[Error Injected] Entered ERROR state: {err_type}")
                
    except Exception as e:
        print(f"Failed to process message: {e}")

client.on_connect = on_connect
client.on_message = on_message

async def heartbeat_loop():
    while True:
        if current_state == STATE_IDLE or current_state == STATE_ERROR:
            publish_status(current_state)
        await asyncio.sleep(30.0)

async def main():
    global main_loop
    main_loop = asyncio.get_running_loop()
    
    print(f"Connecting to broker: {MQTT_BROKER}...")
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    
    # Initialize state
    publish_status(current_state)
    
    # Start tasks
    await asyncio.gather(
        heartbeat_loop()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopping Virtual ESP32 simulator...")
        client.loop_stop()
        client.disconnect()
        sys.exit(0)
