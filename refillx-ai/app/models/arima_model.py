import os
import joblib
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import statsmodels.api as sm
from app.data.preprocessor import Preprocessor
from app.utils.logger import get_logger

logger = get_logger("arima_model")

class ARIMAForecaster:
    def __init__(self, default_order=(2, 1, 2)):
        self.default_order = default_order
        self.models = {}
        self.models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "saved_models")
        os.makedirs(self.models_dir, exist_ok=True)

    def train(self, machine_id, df_transactions):
        """
        Train ARIMA model for a specific dispenser with AIC order selection (Layer 4D)
        """
        logger.info(f"Training ARIMA model for dispenser: {machine_id}")
        
        # Prepare time series hourly
        df_ts = Preprocessor.prepare_time_series(df_transactions, machine_id)
        if len(df_ts) < 24:
            logger.warn(f"Insufficient history for {machine_id} ({len(df_ts)} points). Training mock.")
            # Generate dummy fit info
            return {
                "machineId": machine_id,
                "aic": 999.0,
                "order_selected": self.default_order,
                "training_samples": len(df_ts)
            }

        # Grid search order parameters (p, 1, q) to pick lowest AIC
        best_aic = float("inf")
        best_order = self.default_order
        best_fit = None

        # Check aic for combinations of p in [1, 2, 3] and q in [1, 2]
        for p in [1, 2, 3]:
            for q in [1, 2]:
                order = (p, 1, q)
                try:
                    # Fit ARIMA model
                    model = sm.tsa.ARIMA(df_ts["volume"], order=order)
                    fit = model.fit()
                    if fit.aic < best_aic:
                        best_aic = fit.aic
                        best_order = order
                        best_fit = fit
                except Exception as e:
                    # Skip failed order parameters
                    continue

        if best_fit is None:
            # Fallback to default order
            try:
                model = sm.tsa.ARIMA(df_ts["volume"], order=self.default_order)
                best_fit = model.fit()
                best_aic = best_fit.aic
            except Exception as e:
                logger.error(f"Fallback ARIMA fit failed: {e}")
                # Create a mock fit or return early
                return {
                    "machineId": machine_id,
                    "aic": 999.0,
                    "order_selected": self.default_order,
                    "training_samples": len(df_ts)
                }

        # Cache in memory
        self.models[machine_id] = best_fit
        
        # Save to disk
        model_path = os.path.join(self.models_dir, f"arima_{machine_id}.pkl")
        joblib.dump({
            "order": best_order,
            "params": best_fit.params,
            "endog": best_fit.model.endog
        }, model_path)
        
        logger.info(f"ARIMA training complete for {machine_id}. Selected order: {best_order}, AIC: {best_aic:.2f}")
        return {
            "machineId": machine_id,
            "aic": float(best_aic),
            "order_selected": best_order,
            "training_samples": len(df_ts)
        }

    def predict(self, machine_id, steps=168, current_stock_level=50.0):
        """
        Generate 168 hours demand forecast and nextRefillAt prediction (Layer 4D)
        """
        logger.info(f"Generating forecast for dispenser: {machine_id}")
        fit_model = self.models.get(machine_id)
        
        if fit_model is None:
            # Try to load from disk
            model_path = os.path.join(self.models_dir, f"arima_{machine_id}.pkl")
            if os.path.exists(model_path):
                try:
                    loaded = joblib.load(model_path)
                    order = loaded.get("order", self.default_order)
                    # Re-fit with loaded variables for forecasting
                    model = sm.tsa.ARIMA(loaded["endog"], order=order)
                    fit_model = model.smooth(loaded["params"])
                    self.models[machine_id] = fit_model
                except Exception as e:
                    logger.error(f"Failed to load ARIMA model from disk for {machine_id}: {e}")

        # Fallback simulation if model fits fail
        now = datetime.utcnow()
        if fit_model is None:
            logger.warn(f"No ARIMA model found for {machine_id}. Simulating mock forecast.")
            predicted_values = [abs(np.random.normal(0.6, 0.2)) for _ in range(steps)]
            ci_half = [0.3 for _ in range(steps)]
        else:
            try:
                forecast = fit_model.get_forecast(steps=steps)
                predicted_values = forecast.predicted_mean.tolist()
                # Bound below by 0
                predicted_values = [max(0.0, val) for val in predicted_values]
                
                conf_int = forecast.conf_int()
                if hasattr(conf_int, "iloc"):
                    ci_half = ((conf_int.iloc[:, 1] - conf_int.iloc[:, 0]) / 2.0).tolist()
                else:
                    ci_half = ((conf_int[:, 1] - conf_int[:, 0]) / 2.0).tolist()
            except Exception as e:
                logger.error(f"ARIMA forecast execution failed: {e}. Falling back to simulation.")
                predicted_values = [abs(np.random.normal(0.6, 0.2)) for _ in range(steps)]
                ci_half = [0.3 for _ in range(steps)]

        # Compile list forecast details
        forecast_list = []
        cumulative_demand = 0.0
        refill_timestamp_str = None
        peak_hour = 12
        max_demand = -1.0
        
        for i in range(steps):
            ts = now + timedelta(hours=i)
            pred_vol = float(predicted_values[i])
            ci = float(ci_half[i])
            
            # Find peak demand hour
            if pred_vol > max_demand:
                max_demand = pred_vol
                peak_hour = ts.hour
                
            forecast_list.append({
                "timestamp": ts.isoformat() + "Z",
                "predicted_volume": round(pred_vol * 1000.0, 1), # In ml
                "lower_ci": round(max(0.0, pred_vol - ci) * 1000.0, 1),
                "upper_ci": round((pred_vol + ci) * 1000.0, 1)
            })
            
            # Compute nextRefillAt (cumulative forecast exceeds current stock level)
            cumulative_demand += pred_vol
            if refill_timestamp_str is None and cumulative_demand >= current_stock_level:
                refill_timestamp_str = (ts + timedelta(hours=1)).isoformat() + "Z"

        # Default fallback to 7 days out
        if refill_timestamp_str is None:
            refill_timestamp_str = (now + timedelta(days=7)).isoformat() + "Z"

        return {
            "forecast": forecast_list,
            "next_peak_hour": int(peak_hour),
            "nextRefillAt": refill_timestamp_str
        }

    def retrain_all(self, firestore_loader, days=90):
        """
        Retrain ARIMA model for all dispensers in Firestore (Layer 4D)
        """
        logger.info("Retraining all ARIMA forecaster models.")
        df_txns = firestore_loader.load_transactions(days=days)
        if df_txns.empty:
            logger.warn("No transactions found for retraining. Exiting.")
            return {"status": "skipped", "message": "No transactions loaded."}

        machine_ids = df_txns["machineId"].unique().tolist()
        summary = {}
        for mid in machine_ids:
            try:
                res = self.train(mid, df_txns)
                summary[mid] = res
            except Exception as e:
                logger.error(f"ARIMA retrain failed for dispenser {mid}: {e}")
                summary[mid] = {"status": "failed", "error": str(e)}

        return summary
