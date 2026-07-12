import os
import joblib
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from app.data.preprocessor import Preprocessor
from app.utils.logger import get_logger

logger = get_logger("kmeans_model")

class UserSegmenter:
    def __init__(self, k=5):
        self.k = k
        self.segment_labels = {
            0: "Occasional",
            1: "Regular",
            2: "Eco-Hero",
            3: "Champion",
            4: "Power User"
        }
        self.model = None
        self.scaler = None
        self.cluster_to_label = {} # Maps fitted cluster index (0..4) to label string
        self.models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "saved_models")
        os.makedirs(self.models_dir, exist_ok=True)

    def train(self, df_users, df_txns):
        """
        Train K-Means clustering model to segment user profiles (Layer 4G)
        """
        logger.info("Training K-Means user segmenter...")
        if df_users.empty or len(df_users) < self.k:
            logger.warn("Insufficient users to train segmenter. Using dummy configuration.")
            return {"k_used": self.k, "inertia": 0.0, "cluster_sizes": {}, "feature_importances": {}}

        # Prepare user features using preprocessor
        X_scaled, uids, scaler = Preprocessor.prepare_user_features(df_users, df_txns)
        self.scaler = scaler

        # 1. Elbow Method: compute inertia for k=2 to k=10
        inertias = []
        max_k = min(10, len(df_users))
        for ki in range(2, max_k + 1):
            km = KMeans(n_clusters=ki, random_state=42, n_init=10)
            km.fit(X_scaled)
            inertias.append(km.inertia_)
        logger.info(f"Elbow inertias computed for k=2..{max_k}: {inertias}")

        # Choose k automatically (select self.k = 5, or clamp to size of users)
        k_optimal = min(self.k, len(df_users))
        
        # Fit K-Means
        self.model = KMeans(n_clusters=k_optimal, random_state=42, n_init=10)
        clusters = self.model.fit_predict(X_scaled)

        # 2. Map clusters to business tiers (sort clusters by average ecoPoints / eco_score)
        # Calculate mean eco_score for each cluster to order them
        cluster_eco_means = []
        for c in range(k_optimal):
            # indices belonging to cluster c
            c_indices = np.where(clusters == c)[0]
            # Map back to raw ecoPoints
            c_users = df_users.iloc[c_indices]
            mean_pts = c_users["ecoPoints"].mean()
            cluster_eco_means.append((c, mean_pts))
            
        # Sort by mean ecoPoints ascending
        cluster_eco_means.sort(key=lambda x: x[1])
        
        # Map lowest average ecoPoints to "Occasional" and highest to "Power User"
        self.cluster_to_label = {}
        for rank, (c_idx, _) in enumerate(cluster_eco_means):
            # Clamp rank to index of business labels
            label_str = self.segment_labels.get(rank, "Power User")
            self.cluster_to_label[c_idx] = label_str

        # Calculate cluster sizes
        unique, counts = np.unique(clusters, return_counts=True)
        cluster_sizes = {self.cluster_to_label[u]: int(cnt) for u, cnt in zip(unique, counts)}

        # Dummy feature importances (e.g. centroid coordinate variances)
        centroids = self.model.cluster_centers_
        feature_variances = np.var(centroids, axis=0)
        feature_cols = ["usage_frequency", "avg_volume", "total_volume", "eco_score", "preferred_time", "preferred_product"]
        feat_importances = {col: float(var) for col, var in zip(feature_cols, feature_variances)}

        # Save to disk
        model_path = os.path.join(self.models_dir, "kmeans.pkl")
        joblib.dump({
            "model": self.model,
            "scaler": self.scaler,
            "cluster_to_label": self.cluster_to_label,
            "feature_importances": feat_importances
        }, model_path)

        logger.info(f"K-Means training complete. Clusters mapped: {self.cluster_to_label}")
        return {
            "k_used": k_optimal,
            "inertia": float(self.model.inertia_),
            "cluster_sizes": cluster_sizes,
            "feature_importances": feat_importances
        }

    def segment(self, uid, firestore_loader) -> dict:
        """
        Segment a specific user profile (Layer 4G)
        """
        logger.info(f"Segmenting user: {uid}")
        
        # Load from disk
        model_path = os.path.join(self.models_dir, "kmeans.pkl")
        loaded = None
        if os.path.exists(model_path):
            try:
                loaded = joblib.load(model_path)
                self.model = loaded.get("model")
                self.scaler = loaded.get("scaler")
                self.cluster_to_label = loaded.get("cluster_to_label", {})
            except Exception as e:
                logger.error(f"Failed to load K-Means model from disk: {e}")

        # Fetch all user info for mapping
        df_users = firestore_loader.load_all_users()
        df_txns = firestore_loader.load_transactions(days=90)
        
        # Edge case: Cold start / model missing
        if self.model is None or df_users.empty or uid not in df_users["uid"].values:
            logger.warn(f"Cold-start user {uid} or model not trained. Returning Occasional segment.")
            return {
                "uid": uid,
                "segment": "Occasional",
                "cluster_id": 0,
                "usage_frequency": 0.0,
                "avg_volume": 0.0,
                "eco_score": 0,
                "percentile": 10.0,
                "insights": ["New account profile", "No transaction history recorded"]
            }

        # Calculate features for this user
        X_scaled, uids, _ = Preprocessor.prepare_user_features(df_users, df_txns)
        user_idx = uids.index(uid)
        
        # Predict cluster
        user_features = X_scaled[user_idx].reshape(1, -1)
        cluster_id = int(self.model.predict(user_features)[0])
        segment_str = self.cluster_to_label.get(cluster_id, "Occasional")

        # Gather profile metrics
        user_row = df_users[df_users["uid"] == uid].iloc[0]
        eco_pts = int(user_row.get("ecoPoints", 0))
        wallet = float(user_row.get("walletBalance", 0.0))
        
        # Calculate percentile
        all_points = df_users["ecoPoints"].values
        percentile = float(round((np.sum(all_points <= eco_pts) / len(all_points)) * 100.0, 1))

        # Re-derive unscaled metrics for output
        # Get matching values
        df_feats_unscaled = []
        # Calculate unscaled metrics
        u_txns = df_txns[df_txns["uid"] == uid]
        def parse_vol(v):
            if isinstance(v, (int, float)):
                return v
            try:
                num = float(v.replace(" ml", "").replace("ml", "").strip())
                return num
            except Exception:
                return 0.0

        if not u_txns.empty:
            u_txns = u_txns.copy()
            u_txns["volume_ml"] = u_txns["volume"].apply(parse_vol)
            u_txns["timestamp"] = pd.to_datetime(u_txns["timestamp"])
            time_span_days = max(1, (u_txns["timestamp"].max() - u_txns["timestamp"].min()).days)
            usage_freq = len(u_txns) / max(0.14, (time_span_days / 7.0))
            avg_vol = u_txns["volume_ml"].mean()
            pref_prod_str = u_txns["productType"].mode().iloc[0] if not u_txns["productType"].mode().empty else "Purified Water"
        else:
            usage_freq = 0.0
            avg_vol = 0.0
            pref_prod_str = "Purified Water"

        # Generate custom insights list based on metrics (Layer 4G)
        insights = [
            f"Consumes average {avg_vol:.0f}ml per refill session",
            f"Prefers product: {pref_prod_str}"
        ]
        if usage_freq >= 3.0:
            insights.append(f"Highly active: Refills {usage_freq:.1f}x per week")
        else:
            insights.append(f"Refills periodically: {usage_freq:.1f}x per week")
            
        if eco_pts > 500:
            insights.append("Top green contributor badge unlocked")

        return {
            "uid": uid,
            "segment": segment_str,
            "cluster_id": cluster_id,
            "usage_frequency": float(round(usage_freq, 2)),
            "avg_volume": float(round(avg_vol, 1)),
            "eco_score": int(eco_pts),
            "percentile": float(percentile),
            "insights": insights
        }

    def segment_all(self, firestore_loader) -> dict:
        """
        Segment all active users (Layer 4G)
        """
        df_users = firestore_loader.load_all_users()
        if df_users.empty:
            return {"segment_counts": {}, "avg_features_per_segment": {}}

        results = []
        for uid in df_users["uid"].values:
            results.append(self.segment(uid, firestore_loader))

        df_res = pd.DataFrame(results)
        segment_counts = df_res["segment"].value_counts().to_dict()
        
        # Convert segment counts values to regular int
        segment_counts = {k: int(v) for k, v in segment_counts.items()}

        avg_features = {}
        for seg, grp in df_res.groupby("segment"):
            avg_features[seg] = {
                "avg_usage_frequency": float(round(grp["usage_frequency"].mean(), 2)),
                "avg_volume": float(round(grp["avg_volume"].mean(), 1)),
                "avg_eco_score": float(round(grp["eco_score"].mean(), 1))
            }

        return {
            "segment_counts": segment_counts,
            "avg_features_per_segment": avg_features
        }
