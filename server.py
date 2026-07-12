import http.server
import socketserver
import json
import smtplib
import os
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from urllib.parse import urlparse, parse_qs

# ==========================================
# 📧 EMAIL CONFIGURATION
# ==========================================
SENDER_EMAIL = "s.24.gyani@gmail.com"
SENDER_PASSWORD = "axoc jmka ugni kaoh"
# ==========================================

PORT = 8080

DB_FILE = 'local_db.json'
db_lock = threading.Lock()

# Initial empty state
DB_STATE = {
    'stations': {
        'RFX-001': {
            'tanks': { 'water': 10000, 'shampoo': 5000, 'detergent': 5000, 'handwash': 5000, 'oil': 5000 },
            'health': { 'lastPing': 0, 'sensors': {} },
            'dispense': { 'status': 'idle', 'progress': 0 }
        }
    },
    'settings': {
        'prices': {}
    },
    'logs': {
        'sessions': {}
    },
    'users': {},
    'sessions': {},
    'orders': {}
}

def load_db():
    global DB_STATE
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
                DB_STATE.update(loaded)
        except Exception as e:
            print("Error loading DB:", e)

def save_db():
    with db_lock:
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(DB_STATE, f)

load_db()

def deep_update(d, u):
    for k, v in u.items():
        if isinstance(v, dict) and k in d and isinstance(d[k], dict):
            deep_update(d[k], v)
        else:
            d[k] = v

def get_by_path(d, path):
    keys = [k for k in path.split('/') if k]
    curr = d
    for k in keys:
        if isinstance(curr, dict) and k in curr:
            curr = curr[k]
        else:
            return None
    return curr

def set_by_path(d, path, val):
    keys = [k for k in path.split('/') if k]
    if not keys: return
    curr = d
    for k in keys[:-1]:
        if k not in curr or not isinstance(curr[k], dict):
            curr[k] = {}
        curr = curr[k]
    curr[keys[-1]] = val

class KioskHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        # Original status endpoint for old logic (if any)
        if parsed_path.path == '/status':
            qs = parse_qs(parsed_path.query)
            sid = qs.get('sid', [''])[0]
            # fallback mock
            status = 'unknown'
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'status': status}).encode('utf-8'))
            
        # LOCAL CLOUD SERVER ENDPOINTS
        elif parsed_path.path == '/api/sync':
            # Returns the entire DB state
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(DB_STATE).encode('utf-8'))

        elif parsed_path.path == '/api/get':
            qs = parse_qs(parsed_path.query)
            path = qs.get('path', [''])[0]
            val = get_by_path(DB_STATE, path)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'value': val}).encode('utf-8'))
            
        else:
            super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path in ['/api/set', '/api/update', '/api/push']:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                path = data.get('path', '')
                value = data.get('data')
                
                with db_lock:
                    if parsed_path.path == '/api/set':
                        if path == '/':
                            global DB_STATE
                            DB_STATE = value
                        else:
                            set_by_path(DB_STATE, path, value)
                            
                    elif parsed_path.path == '/api/update':
                        # update implies merging at the specific path
                        curr = get_by_path(DB_STATE, path)
                        if curr is None or not isinstance(curr, dict):
                            set_by_path(DB_STATE, path, value)
                        else:
                            # if it's a dict, deep update
                            if isinstance(value, dict):
                                deep_update(curr, value)
                            else:
                                set_by_path(DB_STATE, path, value)
                                
                    elif parsed_path.path == '/api/push':
                        curr = get_by_path(DB_STATE, path)
                        if curr is None or not isinstance(curr, dict):
                            set_by_path(DB_STATE, path, {})
                            curr = get_by_path(DB_STATE, path)
                        
                        import time
                        push_id = "-L" + str(int(time.time() * 1000)) + "X"
                        curr[push_id] = value
                
                # Async save
                threading.Thread(target=save_db).start()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            except Exception as e:
                print("API ERROR:", e)
                self.send_response(500)
                self.end_headers()
                
        elif parsed_path.path == '/send-receipt':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                recipient = data.get('email')
                name = data.get('name')
                product = data.get('product')
                volume = data.get('volume')
                price = data.get('price')
                date_time = data.get('date_time')
                txn = data.get('txn')
                
                msg = MIMEMultipart()
                msg['From'] = f"RefillX Station <{SENDER_EMAIL}>"
                msg['To'] = recipient
                msg['Subject'] = f"Your RefillX Receipt: {product} ({volume})"
                
                html_content = f"""
                <html>
                  <body style="font-family: Arial, sans-serif; background-color: #060f09; color: #ffffff; padding: 40px; text-align: center;">
                    <div style="max-width: 500px; margin: 0 auto; background-color: #111111; padding: 40px; border: 2px dashed #3ecf7a; border-radius: 20px;">
                        <h2 style="color: #3ecf7a; font-size: 28px; font-weight: 900; margin-bottom: 5px;">REFILLX</h2>
                        <p style="color: #888888; margin-top: 0;">Eco-Park, Sector 5, BLR</p>
                        <hr style="border: 1px solid #333333; margin: 20px 0;">
                        <p style="text-align: left; margin: 5px 0;"><strong>Txn ID:</strong> <span style="float: right;">{txn}</span></p>
                        <p style="text-align: left; margin: 5px 0;"><strong>Date:</strong> <span style="float: right;">{date_time}</span></p>
                        <p style="text-align: left; margin: 5px 0;"><strong>Name:</strong> <span style="float: right;">{name}</span></p>
                        <hr style="border: 1px solid #333333; margin: 20px 0;">
                        <div style="text-align: left; font-size: 20px; font-weight: bold; margin-bottom: 20px;">
                            <span>{product} ({volume})</span>
                            <span style="float: right; color: #3ecf7a;">{price}</span>
                        </div>
                        <hr style="border: 1px solid #333333; margin: 20px 0;">
                        <p style="font-size: 16px; color: #3ecf7a;">Thank you for saving the planet! 🌍</p>
                    </div>
                  </body>
                </html>
                """
                msg.attach(MIMEText(html_content, 'html'))
                server = smtplib.SMTP('smtp.gmail.com', 587)
                server.starttls()
                server.login(SENDER_EMAIL, SENDER_PASSWORD)
                server.send_message(msg)
                server.quit()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': True}).encode('utf-8'))
            except Exception as e:
                print(f"Failed to send email: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
        else:
            super().do_POST()

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass

with ThreadingTCPServer(("", PORT), KioskHandler) as httpd:
    print(f"RefillX Local Cloud Server running on port {PORT} with Email support!")
    httpd.serve_forever()
