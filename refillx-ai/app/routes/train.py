import uuid
import threading
from flask import Blueprint, request, jsonify
from app.utils.logger import get_logger

bp = Blueprint("train", __name__)
logger = get_logger("routes.train")

# Global background training job tracker
training_jobs = {}

def run_retraining_worker(job_id, models_to_train):
    logger.info(f"Worker thread started for job {job_id} training: {models_to_train}")
    training_jobs[job_id]["status"] = "training"
    training_jobs[job_id]["progress"] = 10
    
    from app.data.firestore_loader import FirestoreLoader
    from app.models.arima_model import ARIMAForecaster
    from app.models.lstm_model import LSTMPredictor
    from app.models.collaborative_filter import ProductRecommender
    from app.models.kmeans_model import UserSegmenter
    from app.models.random_forest import StockAlerter
    
    loader = FirestoreLoader()
    results = {}
    
    try:
        # Load standard histories
        df_txns = loader.load_transactions(days=90)
        df_users = loader.load_all_users()
        
        progress_step = 80 // len(models_to_train)
        current_progress = 10
        
        for model_name in models_to_train:
            logger.info(f"Job {job_id}: Training {model_name}...")
            
            if model_name == "arima":
                forecaster = ARIMAForecaster()
                res = forecaster.retrain_all(loader, days=90)
                results["arima"] = res
            elif model_name == "lstm":
                predictor = LSTMPredictor()
                res = {}
                mids = df_txns["machineId"].unique().tolist() if not df_txns.empty else ["sim-001"]
                for mid in mids:
                    res[mid] = predictor.train(mid, df_txns)
                results["lstm"] = res
            elif model_name == "collab":
                recommender = ProductRecommender()
                res = recommender.train(df_txns)
                results["collab"] = res
            elif model_name == "kmeans":
                segmenter = UserSegmenter()
                res = segmenter.train(df_users, df_txns)
                results["kmeans"] = res
            elif model_name == "rf":
                alerter = StockAlerter()
                df_stock = loader.load_stock_history("sim-001")
                res = alerter.train(df_stock)
                results["rf"] = res
                
            current_progress += progress_step
            training_jobs[job_id]["progress"] = min(90, current_progress)
            
        training_jobs[job_id]["status"] = "completed"
        training_jobs[job_id]["progress"] = 100
        training_jobs[job_id]["results"] = results
        logger.info(f"Worker thread completed job {job_id} successfully.")
    except Exception as e:
        logger.error(f"Worker thread job {job_id} failed: {e}")
        training_jobs[job_id]["status"] = "failed"
        training_jobs[job_id]["results"] = {"error": str(e)}

@bp.route("/api/train", methods=["POST"])
def trigger_training():
    """
    Trigger retraining in a background worker thread (Layer 4I)
    """
    data = request.json or {}
    models_input = data.get("models", "all")
    
    valid_models = ["arima", "lstm", "kmeans", "rf", "collab"]
    
    if models_input == "all":
        models_to_train = valid_models
    elif isinstance(models_input, list):
        models_to_train = [m for m in models_input if m in valid_models]
    else:
        return jsonify({"error": "Invalid models parameter. Must be 'all' or list of models."}), 400
        
    if not models_to_train:
        return jsonify({"error": "No valid models specified for training."}), 400
        
    job_id = str(uuid.uuid4())
    training_jobs[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "results": None
    }
    
    # Calculate estimated training duration (e.g. 5 seconds per model)
    est_time = len(models_to_train) * 5
    
    # Start thread
    thread = threading.Thread(target=run_retraining_worker, args=(job_id, models_to_train))
    thread.daemon = True
    thread.start()
    
    return jsonify({
        "job_id": job_id,
        "models_queued": models_to_train,
        "estimated_time_seconds": est_time
    }), 202

@bp.route("/api/train/status/<job_id>", methods=["GET"])
def get_training_status(job_id):
    """
    Get retraining progress status (Layer 4I)
    """
    job = training_jobs.get(job_id)
    if not job:
        return jsonify({"error": f"Job {job_id} not found."}), 404
        
    return jsonify(job), 200
