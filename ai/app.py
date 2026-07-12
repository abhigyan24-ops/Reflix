import os
from flask import Flask, jsonify, request

app = Flask(__name__)

# Root route to check service health
@app.route("/", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "RefillX AI Microservice",
        "version": "1.0.0"
    }), 200

# 1. GET /api/forecast/{machineId} -> 7-day demand forecast per machine (ARIMA / LSTM simulation)
@app.route("/api/forecast/<machineId>", methods=["GET"])
def get_forecast(machineId):
    # Log triggering
    app.logger.info(f"Demand forecast requested for dispenser: {machineId}")
    
    # Return placeholder demand forecasting response
    response_data = {
        "machineId": machineId,
        "nextRefillAt": "2026-06-03T18:00:00Z",
        "predictedDemand": [12.5, 14.2, 11.8, 15.0, 16.5, 18.0, 13.9], # 7-day volume forecast in liters
        "modelUsed": "ARIMA(2,1,2)",
        "stockOutProbability48h": 0.12,
        "updatedAt": "2026-05-27T17:00:00Z"
    }
    return jsonify(response_data), 200

# 2. GET /api/recommend/{userId} -> top-3 product recommendations per user
@app.route("/api/recommend/<userId>", methods=["GET"])
def get_recommendations(userId):
    app.logger.info(f"Product recommendations requested for user: {userId}")
    
    response_data = {
        "userId": userId,
        "recommendations": [
            {"productType": "Alkaline Water", "matchScore": 0.95, "reason": "Based on hydration preferences"},
            {"productType": "Mineral Water", "matchScore": 0.82, "reason": "Popular at your primary location"},
            {"productType": "Sparkling Water", "matchScore": 0.65, "reason": "Recommended alternative"}
        ],
        "modelUsed": "Collaborative Filtering"
    }
    return jsonify(response_data), 200

# 3. POST /api/train -> trigger model retraining
@app.route("/api/train", methods=["POST"])
def train_models():
    app.logger.info("Model retraining triggered manually or scheduled")
    
    # In a real environment, this spins up a background thread or pub/sub job
    response_data = {
        "status": "training_initiated",
        "epochs": 50,
        "models": ["ARIMA_Demand", "LSTM_Consumption", "KMeans_Segmenter", "RandomForest_Stockout"],
        "message": "Retraining job submitted successfully to background worker"
    }
    return jsonify(response_data), 202

# 4. GET /api/segment/{userId} -> user segmentation (Eco-Hero, Regular, etc.)
@app.route("/api/segment/<userId>", methods=["GET"])
def get_segment(userId):
    app.logger.info(f"User segmentation lookup for: {userId}")
    
    response_data = {
        "userId": userId,
        "segment": "Eco-Hero",
        "segmentId": 3,
        "ecoPointsPercentile": 98.4,
        "insights": [
            "Consistent reusable bottle utilization (8 refills/week average)",
            "Strong preference for carbon-neutral water hubs",
            "High loyalty index to Sector 62 dispenser"
        ],
        "modelUsed": "K-Means (k=5)"
    }
    return jsonify(response_data), 200

if __name__ == "__main__":
    # Get port from environment variable, default to 8080 for Cloud Run compatibility
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
