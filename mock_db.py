import json
import time
import random

now = int(time.time() * 1000)
day_ms = 86400000

db = {
    'stations': {
        'RFX-001': {
            'tanks': { 'water': 4500, 'shampoo': 400, 'detergent': 1000, 'handwash': 4000, 'oil': 200 },
            'health': { 'lastPing': now, 'score': 95, 'sensors': {} }
        }
    },
    'settings': {
        'prices': {'water': 2, 'shampoo': 15, 'detergent': 12, 'handwash': 10, 'oil': 25}
    },
    'sessions': {}
}

products = ['water', 'shampoo', 'detergent', 'handwash', 'oil']

for i in range(50):
    # random time in last 10 days
    t = now - random.randint(0, 10) * day_ms - random.randint(0, day_ms)
    prod = random.choice(products)
    qty = random.randint(1, 5) * 100
    amt = (qty / 100.0) * db['settings']['prices'][prod]
    
    session_id = f"-L{t}X{i}"
    db['sessions'][session_id] = {
        'timestamp': t,
        'product': prod,
        'quantity': qty,
        'amount': amt,
        'duration': random.randint(10, 60),
        'userId': f"USR{random.randint(100, 999)}"
    }

with open('local_db.json', 'w') as f:
    json.dump(db, f)

print("Mock data generated in local_db.json")
