from flask import Blueprint, jsonify
from datetime import datetime
from app.models.collaborative_filter import ProductRecommender
from app.data.firestore_loader import FirestoreLoader
from app.utils.logger import get_logger

bp = Blueprint("recommend", __name__)
logger = get_logger("routes.recommend")

loader = FirestoreLoader()
recommender = ProductRecommender()

@bp.route("/api/recommend/<user_id>", methods=["GET"])
def get_recommendations(user_id):
    """
    Get top product recommendations for a user (Layer 4I)
    """
    logger.info(f"Received recommendation request for user {user_id}")
    
    # Trigger model load & predict
    recs = recommender.recommend(user_id, n=3)
    
    return jsonify({
        "uid": user_id,
        "recommendations": recs,
        "generated_at": datetime.utcnow().isoformat() + "Z"
    }), 200
