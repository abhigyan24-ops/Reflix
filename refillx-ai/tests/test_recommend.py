import os
import pytest
from unittest.mock import MagicMock, patch
from app import create_app
from app.models.collaborative_filter import ProductRecommender
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
    loader.load_transactions = MagicMock(return_value=df_tx)
    return loader

def test_recommend_new_user_returns_popular_products(mock_loader):
    recommender = ProductRecommender()
    df_tx = mock_loader.load_transactions()
    recommender.train(df_tx)
    
    # usr_new is not in the training set
    recs = recommender.recommend("usr_new", n=3)
    assert len(recs) == 3
    assert recs[0]["reason"] == "popular"
    assert "productType" in recs[0]
    assert "score" in recs[0]

def test_recommend_existing_user_returns_3_items(mock_loader):
    recommender = ProductRecommender()
    df_tx = mock_loader.load_transactions()
    recommender.train(df_tx)
    
    existing_user = recommender.user_list[0]
    recs = recommender.recommend(existing_user, n=3)
    assert len(recs) == 3
    assert "productType" in recs[0]
    assert "score" in recs[0]

@patch("app.routes.recommend.loader")
def test_recommend_endpoint_returns_200(mock_route_loader, client, mock_loader):
    mock_route_loader.load_transactions.return_value = mock_loader.load_transactions()
    mock_route_loader.db = None

    response = client.get("/api/recommend/usr_test_savior")
    assert response.status_code == 200
    
    data = response.get_json()
    assert data["uid"] == "usr_test_savior"
    assert "recommendations" in data
    assert len(data["recommendations"]) == 3
