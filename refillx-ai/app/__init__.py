import os
from flask import Flask, jsonify
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "refillx_ai_secret_key")

    # Import blueprints
    from app.routes.forecast import bp as forecast_bp
    from app.routes.recommend import bp as recommend_bp
    from app.routes.segment import bp as segment_bp
    from app.routes.stock import bp as stock_bp
    from app.routes.train import bp as train_bp

    # Register blueprints
    app.register_blueprint(forecast_bp)
    app.register_blueprint(recommend_bp)
    app.register_blueprint(segment_bp)
    app.register_blueprint(stock_bp)
    app.register_blueprint(train_bp)

    # Health check route
    @app.route("/health", methods=["GET"])
    def health():
        from app.models.arima_model import ARIMAForecaster
        from app.models.lstm_model import LSTMPredictor
        from app.models.collaborative_filter import ProductRecommender
        from app.models.kmeans_model import UserSegmenter
        from app.models.random_forest import StockAlerter
        
        # Verify models are trained or present
        models_loaded = []
        models_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "saved_models")
        
        # Checks files existence on disk
        if os.path.exists(os.path.join(models_dir, "kmeans.pkl")):
            models_loaded.append("kmeans")
        if os.path.exists(os.path.join(models_dir, "random_forest.pkl")):
            models_loaded.append("rf")
        if os.path.exists(os.path.join(models_dir, "collab_filter.pkl")):
            models_loaded.append("collab")
            
        # ARIMA checks (check if any arima_*.pkl exists)
        if os.path.exists(models_dir):
            files = os.listdir(models_dir)
            if any(f.startswith("arima_") for f in files):
                models_loaded.append("arima")
            if any(f.startswith("lstm_") for f in files):
                models_loaded.append("lstm")

        return jsonify({
            "status": "ok",
            "models_loaded": models_loaded,
            "uptime_seconds": int(os.times()[4])
        }), 200

    return app
