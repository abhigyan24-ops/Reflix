import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from scipy.sparse import csr_matrix

class Preprocessor:
    @staticmethod
    def prepare_time_series(df: pd.DataFrame, machine_id: str) -> pd.DataFrame:
        """
        Prepare hourly time series features for demand forecasting (Layer 4C)
        """
        # Filter for machine ID
        df_filtered = df[df["machineId"] == machine_id].copy()
        
        # Ensure we have a datetime column
        df_filtered["timestamp"] = pd.to_datetime(df_filtered["timestamp"])
        
        # Parse volume string to numerical volume in Litres
        def parse_vol(v):
            if isinstance(v, (int, float)):
                return v / 1000.0
            try:
                num = float(v.replace(" ml", "").replace("ml", "").strip())
                return num / 1000.0
            except Exception:
                return 0.0
                
        df_filtered["volume_l"] = df_filtered["volume"].apply(parse_vol)
        
        # Set index
        df_filtered.set_index("timestamp", inplace=True)
        
        # Resample to hourly and sum volume, fill missing hours with 0
        df_hourly = df_filtered["volume_l"].resample("h").sum().fillna(0.0).to_frame()
        df_hourly.rename(columns={"volume_l": "volume"}, inplace=True)
        
        # Feature engineering (Layer 4C)
        df_hourly["hour_of_day"] = df_hourly.index.hour
        df_hourly["day_of_week"] = df_hourly.index.dayofweek
        df_hourly["is_weekend"] = (df_hourly["day_of_week"] >= 5).astype(int)
        df_hourly["month"] = df_hourly.index.month
        
        # Rolling stats (24h)
        df_hourly["rolling_mean_24h"] = df_hourly["volume"].rolling(window=24, min_periods=1).mean().fillna(0.0)
        df_hourly["rolling_std_24h"] = df_hourly["volume"].rolling(window=24, min_periods=1).std().fillna(0.0)
        
        return df_hourly

    @staticmethod
    def prepare_user_features(df_users: pd.DataFrame, df_txns: pd.DataFrame):
        """
        Extract normalized features for customer K-Means clustering (Layer 4C)
        """
        # Parse transaction volumes
        df_txns = df_txns.copy()
        def parse_vol(v):
            if isinstance(v, (int, float)):
                return v
            try:
                num = float(v.replace(" ml", "").replace("ml", "").strip())
                return num
            except Exception:
                return 0.0
        df_txns["volume_ml"] = df_txns["volume"].apply(parse_vol)
        df_txns["timestamp"] = pd.to_datetime(df_txns["timestamp"])

        features_list = []
        uids = df_users["uid"].unique()

        for uid in uids:
            u_txns = df_txns[df_txns["uid"] == uid]
            
            # 1. Frequency (transactions per week)
            if not u_txns.empty:
                time_span_days = max(1, (u_txns["timestamp"].max() - u_txns["timestamp"].min()).days)
                usage_freq = len(u_txns) / max(0.14, (time_span_days / 7.0)) # min 1 day divisor
                avg_vol = u_txns["volume_ml"].mean()
                tot_vol = u_txns["volume_ml"].sum()
                pref_hour = u_txns["timestamp"].dt.hour.mode().iloc[0] if not u_txns["timestamp"].dt.hour.mode().empty else 12
                pref_prod_str = u_txns["productType"].mode().iloc[0] if not u_txns["productType"].mode().empty else "Purified Water"
                # Encode preferred product type
                pref_prod_id = hash(pref_prod_str) % 5
            else:
                usage_freq = 0.0
                avg_vol = 0.0
                tot_vol = 0.0
                pref_hour = 12
                pref_prod_id = 0

            user_row = df_users[df_users["uid"] == uid].iloc[0]
            eco_pts = float(user_row.get("ecoPoints", 0))

            features_list.append({
                "uid": uid,
                "usage_frequency": float(usage_freq),
                "avg_volume": float(avg_vol),
                "total_volume": float(tot_vol),
                "eco_score": float(eco_pts),
                "preferred_time": float(pref_hour),
                "preferred_product": float(pref_prod_id)
            })

        df_feat = pd.DataFrame(features_list)
        
        # Normalize features with StandardScaler
        cols_to_scale = ["usage_frequency", "avg_volume", "total_volume", "eco_score", "preferred_time", "preferred_product"]
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(df_feat[cols_to_scale])
        
        return X_scaled, df_feat["uid"].tolist(), scaler

    @staticmethod
    def prepare_stock_features(df_stock: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare feature matrix for Stockout Random Forest prediction (Layer 4C)
        """
        # Ensure sorted
        df_stock = df_stock.sort_values(by="timestamp").copy()
        
        # 1. Daily consumption over last 7 days
        df_stock["consumption"] = df_stock["stockLevel"].diff().apply(lambda x: abs(x) if x < 0 else 0)
        
        # rolling 24 hour consumption -> daily equivalent
        df_stock["avg_daily_consumption"] = df_stock["consumption"].rolling(window=24, min_periods=1).sum().fillna(10.0)
        
        # 2. Days since last refill
        days_since_refill = 0
        refill_days_col = []
        for idx, row in df_stock.iterrows():
            if row["refillVolume"] > 0:
                days_since_refill = 0
            else:
                days_since_refill += 1/24.0 # hourly step
            refill_days_col.append(days_since_refill)
        df_stock["days_since_last_refill"] = refill_days_col
        
        # 3. Consumption trend (slope of last 24h vs previous 24h)
        c_trend = []
        for i in range(len(df_stock)):
            if i < 48:
                c_trend.append(0.0)
            else:
                last_24 = df_stock["consumption"].iloc[i-24:i].sum()
                prev_24 = df_stock["consumption"].iloc[i-48:i-24].sum()
                c_trend.append(last_24 - prev_24)
        df_stock["consumption_trend"] = c_trend
        
        features = df_stock[[
            "stockLevel", 
            "avg_daily_consumption", 
            "days_since_last_refill", 
            "isWeekend", 
            "season", 
            "consumption_trend"
        ]].rename(columns={"stockLevel": "current_stock_level", "isWeekend": "is_weekend"})
        
        return features

    @staticmethod
    def prepare_interaction_matrix(df_txns: pd.DataFrame):
        """
        Formulate User-Product sparse matrix for ALS Collaborative Filtering (Layer 4C)
        """
        df_txns = df_txns.copy()
        
        def parse_vol(v):
            if isinstance(v, (int, float)):
                return v
            try:
                num = float(v.replace(" ml", "").replace("ml", "").strip())
                return num
            except Exception:
                return 0.0
        df_txns["volume_ml"] = df_txns["volume"].apply(parse_vol)
        
        # Categorical codes
        df_txns["uid"] = df_txns["uid"].astype("category")
        df_txns["productType"] = df_txns["productType"].astype("category")
        
        # Pivot table sum of volume per user per product
        pivot = df_txns.pivot_table(
            index="uid", 
            columns="productType", 
            values="volume_ml", 
            aggfunc="sum", 
            fill_value=0.0
        )
        
        # Build list mappings
        user_list = pivot.index.tolist()
        product_list = pivot.columns.tolist()
        
        # Return sparse matrix, along with indexes
        sparse_mat = csr_matrix(pivot.values)
        return sparse_mat, user_list, product_list
