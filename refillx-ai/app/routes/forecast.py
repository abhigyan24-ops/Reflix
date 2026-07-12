from flask import Blueprint, jsonify
from app.models.arima_model import ARIMAForecaster
from app.models.lstm_model import LSTMPredictor
from app.models.random_forest import StockAlerter
from app.data.firestore_loader import FirestoreLoader
from app.utils.logger import get_logger

bp = Blueprint("forecast", __name__)
logger = get_logger("routes.forecast")

# Shared model instances
loader = FirestoreLoader()
arima_model = ARIMAForecaster()
lstm_model = LSTMPredictor()
rf_model = StockAlerter()

@bp.route("/api/forecast/<machine_id>", methods=["GET"])
def get_forecast(machine_id):
    """
    Get combined forecast telemetry for a dispenser (Layer 4I)
    """
    logger.info(f"Received forecast request for dispenser {machine_id}")
    
    # 1. Fetch current stock level from Firestore (default 50.0L)
    current_stock = 50.0
    if loader.db is not None:
        try:
            doc_ref = loader.db.collection("dispensers").doc(machine_id)
            doc_snap = doc_ref.get()
            if doc_snap.exists:
                current_stock = float(doc_snap.to_dict().get("stockLevel", 50.0))
        except Exception as e:
            logger.error(f"Failed to fetch stock level for {machine_id}: {e}")

    # 2. Get ARIMA Forecast
    arima_res = arima_model.predict(machine_id, steps=168, current_stock_level=current_stock)
    
    # 3. Get LSTM Forecast (requires last 48 hours of transactions)
    df_txns = loader.load_transactions(days=7)
    lstm_res = lstm_model.predict(machine_id, df_txns)
    
    # 4. Get Stock Risk
    stock_risk = rf_model.predict(
        machine_id=machine_id,
        current_stock_level=current_stock,
        firestore_loader=loader,
        arima_forecaster=arima_model
    )
    
    return jsonify({
        "machineId": machine_id,
        "arima_forecast": arima_res["forecast"],
        "lstm_24h": lstm_res["lstm_24h"],
        "next_peak_hour": arima_res["next_peak_hour"],
        "nextRefillAt": arima_res["nextRefillAt"],
        "stock_risk": stock_risk
    }), 200
