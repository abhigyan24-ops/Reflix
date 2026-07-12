import os
import pytest
import pandas as pd
from unittest.mock import MagicMock, patch
from app import create_app
from app.models.arima_model import ARIMAForecaster
from app.models.lstm_model import LSTMPredictor
from app.data.firestore_loader import FirestoreLoader

# Set environment variables for testing
os.environ["FLASK_ENV"] = "testing"

@pytest.fixture
def app():
    app = create_app()
    return app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def mock_loader():
    loader = FirestoreLoader()
    # Mock load transactions returning a sample transaction DataFrame
    df_tx = loader._generate_mock_transactions(10)
    loader.load_transactions = MagicMock(return_value=df_tx)
    return loader

def test_arima_train_returns_valid_model(mock_loader):
    forecaster = ARIMAForecaster()
    df_tx = mock_loader.load_transactions()
    res = forecaster.train("sim-001", df_tx)
    
    assert res["machineId"] == "sim-001"
    assert "aic" in res
    assert "order_selected" in res
    assert res["training_samples"] > 0

def test_arima_predict_returns_168_hours(mock_loader):
    forecaster = ARIMAForecaster()
    # Ensure model is in-memory
    df_tx = mock_loader.load_transactions()
    forecaster.train("sim-001", df_tx)
    
    res = forecaster.predict("sim-001", steps=168, current_stock_level=45.0)
    assert len(res["forecast"]) == 168
    assert "next_peak_hour" in res
    assert "nextRefillAt" in res
    
    # Check shape of prediction elements
    item = res["forecast"][0]
    assert "timestamp" in item
    assert "predicted_volume" in item
    assert "lower_ci" in item
    assert "upper_ci" in item

def test_lstm_train_completes(mock_loader):
    predictor = LSTMPredictor()
    df_tx = mock_loader.load_transactions()
    res = predictor.train("sim-001", df_tx)
    
    assert res["machineId"] == "sim-001"
    assert "val_loss" in res
    assert "epochs_trained" in res

def test_lstm_predict_returns_24_probabilities(mock_loader):
    predictor = LSTMPredictor()
    df_tx = mock_loader.load_transactions()
    # Pre-train
    predictor.train("sim-001", df_tx)
    
    res = predictor.predict("sim-001", df_tx)
    assert len(res["lstm_24h"]) == 24
    assert "peak_consumption_hour" in res
    
    # Check structure
    hour_item = res["lstm_24h"][0]
    assert "hour" in hour_item
    assert "probability" in hour_item
    assert hour_item["label"] in ["high", "low"]

@patch("app.routes.forecast.loader")
def test_forecast_endpoint_returns_200(mock_route_loader, client, mock_loader):
    # Set route loader mock to return test datasets
    mock_route_loader.load_transactions.return_value = mock_loader.load_transactions()
    mock_route_loader.db = None # Trigger mock pathway

    response = client.get("/api/forecast/sim-001")
    assert response.status_code == 200
    
    data = response.get_json()
    assert data["machineId"] == "sim-001"
    assert "arima_forecast" in data
    assert "lstm_24h" in data
    assert "nextRefillAt" in data
    assert "stock_risk" in data
