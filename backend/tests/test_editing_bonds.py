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

def test_delete_bonds():
    structure = {
        "symbols": ["H", "H"],
        "positions": [[0, 0, 0], [0, 0, 0.74]],
        "wrapped_positions": [[0, 0, 0], [0, 0, 0.74]],
        "cell": [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
        "pbc": [True, True, True]
    }
    
    request_data = {
        "structure": structure,
        "bond_ids": ["0-1"],
        "bond_overrides": {}
    }
    
    response = client.post("/api/edit/delete_bonds", json=request_data)
    assert response.status_code == 200
    data = response.json()
    
    bonds = data["visualization"]["bonds"]
    assert not any(b[0] == 0 and b[1] == 1 for b in bonds)


def test_delete_bonds_respects_bond_scale():
    structure = {
        "symbols": ["H", "H", "H"],
        "positions": [[0, 0, 0], [0, 0, 1.0], [0, 0, 2.0]],
        "wrapped_positions": [[0, 0, 0], [0, 0, 1.0], [0, 0, 2.0]],
        "cell": [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
        "pbc": [True, True, True]
    }

    request_data = {
        "structure": structure,
        "bond_ids": ["0-1"],
        "bond_overrides": {},
        "bond_scale": 2.0,
    }

    response = client.post("/api/edit/delete_bonds", json=request_data)
    assert response.status_code == 200
    data = response.json()

    bonds = data["visualization"]["bonds"]
    assert not any((b[0], b[1]) == (0, 1) or (b[0], b[1]) == (1, 0) for b in bonds)
    assert any((b[0], b[1]) == (1, 2) or (b[0], b[1]) == (2, 1) for b in bonds)
