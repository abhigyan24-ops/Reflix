import os
import time
import random
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from functools import lru_cache
from google.cloud import firestore
from app.utils.logger import get_logger

logger = get_logger("firestore_loader")

# 15-minute TTL cache wrapper using functools.lru_cache (Layer 4B)
def ttl_cache(seconds: int = 900, maxsize: int = 128):
    def decorator(func):
        cached_func = lru_cache(maxsize=maxsize)(func)
        expiration = time.time() + seconds

        def wrapper(*args, **kwargs):
            nonlocal expiration
            if time.time() > expiration:
                cached_func.cache_clear()
                expiration = time.time() + seconds
            return cached_func(*args, **kwargs)
        return wrapper
    return decorator

class FirestoreLoader:
    def __init__(self):
        self.db = None
        try:
            # Look for project ID from env or fallback
            project_id = os.environ.get("FIRESTORE_PROJECT_ID", "refillx-smart")
            # If credential file is provided or running in GCP, Client succeeds
            self.db = firestore.Client(project=project_id)
            logger.info(f"Firestore Client successfully initialized for project {project_id}.")
        except Exception as e:
            logger.warning(f"Could not connect to Firestore: {e}. Fallback mock loader enabled.")

    @ttl_cache(seconds=900)
    def load_transactions(self, days=90) -> pd.DataFrame:
        cols = ["uid", "machineId", "volume", "cost", "timestamp", "productType", "hour", "dayOfWeek", "month"]
        if self.db is None:
            return self._generate_mock_transactions(days)

        try:
            cutoff = datetime.utcnow() - timedelta(days=days)
            txns_ref = self.db.collection("transactions")
            query = txns_ref.where("timestamp", ">=", cutoff).order_by("timestamp", direction="DESCENDING")
            docs = query.stream()
            
            data = []
            for doc in docs:
                d = doc.to_dict()
                ts = d.get("timestamp")
                if not ts:
                    continue
                # Handle firestore Timestamp vs datetime
                dt = ts if isinstance(ts, datetime) else ts.to_datetime() if hasattr(ts, "to_datetime") else datetime.fromtimestamp(ts)
                
                vol_str = d.get("volume", "0 ml")
                cost = float(d.get("cost", 0))
                
                data.append({
                    "uid": d.get("uid", "unknown"),
                    "machineId": d.get("machineId", "unknown"),
                    "volume": vol_str,
                    "cost": cost,
                    "timestamp": dt,
                    "productType": d.get("productType", "Purified Water"),
                    "hour": dt.hour,
                    "dayOfWeek": dt.weekday(),
                    "month": dt.month
                })
            
            if not data:
                logger.info("Firestore transaction collection empty. Returning mock data.")
                return self._generate_mock_transactions(days)

            return pd.DataFrame(data)
        except Exception as e:
            logger.error(f"Error loading transactions from Firestore: {e}. Returning mock data.")
            return self._generate_mock_transactions(days)

    @ttl_cache(seconds=900)
    def load_dispenser_history(self, machine_id, days=30) -> pd.DataFrame:
        if self.db is None:
            return self._generate_mock_dispenser_history(machine_id, days)

        try:
            df = self.load_transactions(days=days)
            df_filtered = df[df["machineId"] == machine_id]
            if df_filtered.empty:
                return self._generate_mock_dispenser_history(machine_id, days)

            # Convert volume string to ml numeric
            df_filtered = df_filtered.copy()
            df_filtered["volume_ml"] = df_filtered["volume"].apply(self._parse_volume_ml)
            
            # Resample by hour
            df_filtered.set_index("timestamp", inplace=True)
            df_hourly = df_filtered["volume_ml"].resample("h").sum().fillna(0).to_frame()
            df_hourly.rename(columns={"volume_ml": "volume"}, inplace=True)
            return df_hourly
        except Exception as e:
            logger.error(f"Error loading dispenser history for {machine_id}: {e}. Returning mock.")
            return self._generate_mock_dispenser_history(machine_id, days)

    @ttl_cache(seconds=900)
    def load_user_history(self, uid) -> pd.DataFrame:
        if self.db is None:
            return self._generate_mock_user_history(uid)

        try:
            df = self.load_transactions(days=90)
            df_user = df[df["uid"] == uid]
            if df_user.empty:
                return self._generate_mock_user_history(uid)

            # Aggregate stats
            df_user = df_user.copy()
            df_user["volume_ml"] = df_user["volume"].apply(self._parse_volume_ml)
            
            summary = []
            for prod, grp in df_user.groupby("productType"):
                summary.append({
                    "uid": uid,
                    "productType": prod,
                    "volume": grp["volume_ml"].sum(),
                    "frequency": len(grp),
                    "lastSeen": grp["timestamp"].max()
                })
            return pd.DataFrame(summary)
        except Exception as e:
            logger.error(f"Error loading user history for {uid}: {e}. Returning mock.")
            return self._generate_mock_user_history(uid)

    @ttl_cache(seconds=900)
    def load_all_users(self) -> pd.DataFrame:
        if self.db is None:
            return self._generate_mock_all_users()

        try:
            users_ref = self.db.collection("users")
            docs = users_ref.stream()

            users_data = []
            for doc in docs:
                d = doc.to_dict()
                users_data.append({
                    "uid": doc.id,
                    "walletBalance": float(d.get("walletBalance", 0)),
                    "ecoPoints": int(d.get("ecoPoints", 0)),
                    "tier": d.get("tier", "Occasional")
                })

            if not users_data:
                return self._generate_mock_all_users()

            df_users = pd.DataFrame(users_data)
            
            # Load transactions to join totalTransactions count
            df_txns = self.load_transactions(days=90)
            if not df_txns.empty:
                txn_counts = df_txns["uid"].value_counts().to_frame().reset_index()
                txn_counts.columns = ["uid", "totalTransactions"]
                df_users = pd.merge(df_users, txn_counts, on="uid", how="left").fillna({"totalTransactions": 0})
            else:
                df_users["totalTransactions"] = 0

            return df_users
        except Exception as e:
            logger.error(f"Error loading all users: {e}. Returning mock.")
            return self._generate_mock_all_users()

    @ttl_cache(seconds=900)
    def load_stock_history(self, machine_id) -> pd.DataFrame:
        # Stock levels history is not natively fully captured in standard transactions collection,
        # so we will generate realistic simulated telemetry changes for stock level
        return self._generate_mock_stock_history(machine_id)

    # --- HELPER METHOD ---
    def _parse_volume_ml(self, vol_str):
        try:
            num = float(vol_str.replace(" ml", "").replace("ml", "").strip())
            return num
        except Exception:
            return 0.0

    # --- MOCK DATA GENERATORS ---
    def _generate_mock_transactions(self, days) -> pd.DataFrame:
        logger.info(f"Generating mock transaction data for last {days} days.")
        np.random.seed(42)
        users = ["usr_test_savior", "usr_savior_2", "usr_savior_3", "usr_savior_4", "usr_savior_5"]
        machines = ["sim-001", "sim-002", "sim-003"]
        products = ["Purified Water", "Mineral Spring Water", "Purified Alkaline Water", "Infused Lemon Water"]
        
        now = datetime.utcnow()
        data = []
        
        # Make ~300 mock transactions
        for _ in range(350):
            delta_days = random.uniform(0, days)
            ts = now - timedelta(days=delta_days)
            machine = random.choice(machines)
            uid = random.choice(users)
            prod = random.choice(products)
            
            vol = random.choice([500, 1000, 1500])
            cost = (vol / 1000.0) * (30 if machine == "sim-001" else 40 if machine == "sim-002" else 25)
            
            data.append({
                "uid": uid,
                "machineId": machine,
                "volume": f"{vol} ml",
                "cost": float(cost),
                "timestamp": ts,
                "productType": prod,
                "hour": ts.hour,
                "dayOfWeek": ts.weekday(),
                "month": ts.month
            })
            
        df = pd.DataFrame(data)
        # Ensure it's sorted by timestamp descending
        df.sort_values(by="timestamp", ascending=False, inplace=True)
        return df.reset_index(drop=True)

    def _generate_mock_dispenser_history(self, machine_id, days) -> pd.DataFrame:
        logger.info(f"Generating mock dispenser hourly history for {machine_id}.")
        now = datetime.utcnow()
        timestamps = pd.date_range(end=now, periods=days * 24, freq="h")
        
        # Simulated volumes (higher demand during midday/weekend hours)
        volumes = []
        for ts in timestamps:
            hour = ts.hour
            is_weekend = ts.weekday() >= 5
            
            base_vol = 500.0 if is_weekend else 300.0
            # Peak consumption: hours 11-14 and 17-20
            if (11 <= hour <= 14) or (17 <= hour <= 20):
                multiplier = random.uniform(1.8, 3.2)
            else:
                multiplier = random.uniform(0.1, 0.9)
                
            volumes.append(base_vol * multiplier)

        df = pd.DataFrame({"volume": volumes}, index=timestamps)
        df.index.name = "timestamp"
        return df

    def _generate_mock_user_history(self, uid) -> pd.DataFrame:
        logger.info(f"Generating mock user profile history for {uid}.")
        products = ["Purified Water", "Mineral Spring Water", "Purified Alkaline Water", "Infused Lemon Water"]
        data = []
        
        now = datetime.utcnow()
        for prod in products[:3]:
            data.append({
                "uid": uid,
                "productType": prod,
                "volume": float(random.randint(5, 25) * 1000),
                "frequency": random.randint(3, 15),
                "lastSeen": now - timedelta(days=random.uniform(0.5, 10))
            })
        return pd.DataFrame(data)

    def _generate_mock_all_users(self) -> pd.DataFrame:
        logger.info("Generating mock users index data.")
        users = [
            {"uid": "usr_test_savior", "walletBalance": 250.0, "ecoPoints": 420, "tier": "Eco-Hero", "totalTransactions": 22},
            {"uid": "usr_savior_2", "walletBalance": 80.0, "ecoPoints": 150, "tier": "Regular", "totalTransactions": 8},
            {"uid": "usr_savior_3", "walletBalance": 1050.0, "ecoPoints": 1200, "tier": "Champion", "totalTransactions": 48},
            {"uid": "usr_savior_4", "walletBalance": 15.0, "ecoPoints": 50, "tier": "Occasional", "totalTransactions": 3},
            {"uid": "usr_savior_5", "walletBalance": 340.0, "ecoPoints": 880, "tier": "Eco-Hero", "totalTransactions": 31},
        ]
        return pd.DataFrame(users)

    def _generate_mock_stock_history(self, machine_id) -> pd.DataFrame:
        logger.info(f"Generating mock stock level timeline for {machine_id}.")
        now = datetime.utcnow()
        periods = 7 * 24 # 7 days hourly
        timestamps = pd.date_range(end=now, periods=periods, freq="h")
        
        stock = 90.0
        stock_levels = []
        refill_volumes = []
        
        for ts in timestamps:
            # Sim stock drawdown
            drawdown = random.uniform(0.2, 1.8)
            stock = max(5.0, stock - drawdown)
            
            # Simulated refill event when stock drops below 15%
            refill_vol = 0.0
            if stock < 15.0:
                refill_vol = 80.0
                stock += refill_vol
                
            stock_levels.append(stock)
            refill_volumes.append(refill_vol)
            
        df = pd.DataFrame({
            "timestamp": timestamps,
            "stockLevel": stock_levels,
            "refillVolume": refill_volumes,
            "season": [int((ts.month % 12) / 3) for ts in timestamps], # 0-3
            "dayOfWeek": [ts.weekday() for ts in timestamps],
            "isWeekend": [1 if ts.weekday() >= 5 else 0 for ts in timestamps]
        })
        return df
