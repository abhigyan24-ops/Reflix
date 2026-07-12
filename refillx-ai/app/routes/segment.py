from flask import Blueprint, jsonify
from app.models.kmeans_model import UserSegmenter
from app.data.firestore_loader import FirestoreLoader
from app.utils.logger import get_logger

bp = Blueprint("segment", __name__)
logger = get_logger("routes.segment")

loader = FirestoreLoader()
segmenter = UserSegmenter()

@bp.route("/api/segment/<user_id>", methods=["GET"])
def get_user_segment(user_id):
    """
    Predict/lookup customer segment for a user (Layer 4I)
    """
    logger.info(f"Received segmentation request for user {user_id}")
    
    seg_res = segmenter.segment(user_id, loader)
    return jsonify(seg_res), 200
