import os
import pytest
from unittest.mock import MagicMock, patch
from app import create_app
from app.models.random_forest import StockAlerter
from app.models.arima_model import ARIMAForecaster
from app.data.firestore_loader import FirestoreLoader

@pytest.fixture
def app():
    return create_app()

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def mock_loader():
    loader = FirestoreLoader()
    df_stock = loader._generate_mock_stock_history("sim-001")
    loader.load_stock_history = MagicMock(return_value=df_stock)
    return loader

def test_rf_train_returns_valid_auc(mock_loader):
    alerter = StockAlerter()
    df_stock = mock_loader.load_stock_history("sim-001")
    res = alerter.train(df_stock)
    
    assert "accuracy" in res
    assert "roc_auc" in res
    assert "feature_importances" in res

def test_stock_predict_returns_probability_in_range(mock_loader):
    alerter = StockAlerter()
    forecaster = ARIMAForecaster()
    df_stock = mock_loader.load_stock_history("sim-001")
    alerter.train(df_stock)
    
    res = alerter.predict("sim-001", current_stock_level=25.0, firestore_loader=mock_loader, arima_forecaster=forecaster)
    
    assert res["machineId"] == "sim-001"
    assert 0.0 <= res["stockout_probability"] <= 1.0
    assert "estimated_hours_remaining" in res
    assert "recommended_action" in res
    assert "confidence" in res

def test_risk_level_matches_probability(mock_loader):
    alerter = StockAlerter()
    forecaster = ARIMAForecaster()
    df_stock = mock_loader.load_stock_history("sim-001")
    alerter.train(df_stock)
    
    # Predict high risk
    res_high = alerter.predict("sim-001", current_stock_level=5.0, firestore_loader=mock_loader, arima_forecaster=forecaster)
    if res_high["stockout_probability"] > 0.6:
        assert res_high["risk_level"] == "HIGH"

    # Predict low risk
    res_low = alerter.predict("sim-001", current_stock_level=95.0, firestore_loader=mock_loader, arima_forecaster=forecaster)
    if res_low["stockout_probability"] < 0.3:
        assert res_low["risk_level"] == "LOW"

@patch("app.routes.stock.loader")
def test_stock_endpoint_returns_200(mock_route_loader, client, mock_loader):
    mock_route_loader.load_stock_history.return_value = mock_loader.load_stock_history("sim-001")
    mock_route_loader.db = None

    response = client.get("/api/stock/sim-001")
    assert response.status_code == 200
    
    data = response.get_json()
    assert data["machineId"] == "sim-001"
    assert "stockout_probability" in data
    assert "risk_level" in data
    assert "estimated_hours_remaining" in data
