import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_bond():
    structure = {
        "symbols": ["H", "H"],
        "positions": [[0, 0, 0], [0, 0, 1.5]],
        "wrapped_positions": [[0, 0, 0], [0, 0, 1.5]],
        "cell": [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
        "pbc": [True, True, True]
    }
    
    request_data = {
        "structure": structure,
        "bond_id": "0-1",
        "bond_overrides": {}
    }
    
    response = client.post("/api/edit/create_bond", json=request_data)
    assert response.status_code == 200
    data = response.json()
    
    bonds = data["visualization"]["bonds"]
    assert any(b[0] == 0 and b[1] == 1 for b in bonds)
