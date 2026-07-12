import os
import pytest
from unittest.mock import MagicMock, patch
from app import create_app
from app.models.kmeans_model import UserSegmenter
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
    df_tx = loader._generate_mock_transactions(15)
    df_users = loader._generate_mock_all_users()
    loader.load_transactions = MagicMock(return_value=df_tx)
    loader.load_all_users = MagicMock(return_value=df_users)
    return loader

def test_kmeans_train_returns_5_clusters(mock_loader):
    segmenter = UserSegmenter(k=5)
    df_users = mock_loader.load_all_users()
    df_txns = mock_loader.load_transactions()
    
    res = segmenter.train(df_users, df_txns)
    assert res["k_used"] == 5
    assert "inertia" in res
    assert "cluster_sizes" in res
    assert "feature_importances" in res

def test_segment_returns_valid_tier(mock_loader):
    segmenter = UserSegmenter(k=5)
    df_users = mock_loader.load_all_users()
    df_txns = mock_loader.load_transactions()
    segmenter.train(df_users, df_txns)
    
    uid = df_users["uid"].iloc[0]
    res = segmenter.segment(uid, mock_loader)
    
    assert res["uid"] == uid
    assert res["segment"] in ["Occasional", "Regular", "Eco-Hero", "Champion", "Power User"]
    assert "cluster_id" in res
    assert "insights" in res

def test_segment_percentile_between_0_and_100(mock_loader):
    segmenter = UserSegmenter(k=5)
    df_users = mock_loader.load_all_users()
    df_txns = mock_loader.load_transactions()
    segmenter.train(df_users, df_txns)
    
    uid = df_users["uid"].iloc[0]
    res = segmenter.segment(uid, mock_loader)
    
    assert 0.0 <= res["percentile"] <= 100.0

@patch("app.routes.segment.loader")
def test_segment_endpoint_returns_200(mock_route_loader, client, mock_loader):
    mock_route_loader.load_transactions.return_value = mock_loader.load_transactions()
    mock_route_loader.load_all_users.return_value = mock_loader.load_all_users()
    mock_route_loader.db = None

    response = client.get("/api/segment/usr_test_savior")
    assert response.status_code == 200
    
    data = response.get_json()
    assert data["uid"] == "usr_test_savior"
    assert "segment" in data
    assert "percentile" in data
    assert "insights" in data
