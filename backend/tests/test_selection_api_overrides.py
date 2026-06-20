import importlib

import pytest
from fastapi.testclient import TestClient
from ase import Atoms
from app.services.structure_utils import atoms_to_response

app = importlib.import_module("app.main").app

client = TestClient(app)


def test_parse_expression_api_with_bond_overrides():
    atoms = Atoms("H2", positions=[[0, 0, 0], [0, 0, 5.0]])
    struct_dict = atoms_to_response(atoms).model_dump()

    # Default selection: should not find the second atom if we start from the first
    # and use "bonded:@0"
    payload = {"structure": struct_dict, "expression": "bonded:@0"}
    response = client.post("/api/selection/parse_expression", json=payload)
    assert response.status_code == 200
    assert response.json()["indices"] == []

    # With override: should find the second atom
    payload_override = {
        "structure": struct_dict,
        "expression": "bonded:@0",
        "bond_overrides": {"0-1": "1.0"},
    }
    response = client.post("/api/selection/parse_expression", json=payload_override)
    assert response.status_code == 200
    assert response.json()["indices"] == [1]


def test_parse_expression_api_with_bond_scale():
    atoms = Atoms("H2", positions=[[0, 0, 0], [0, 0, 1.0]])
    struct_dict = atoms_to_response(atoms).model_dump()

    payload = {
        "structure": struct_dict,
        "expression": "bonded:@0",
        "bond_scale": 1.1,  # Cutoff ~0.68 -> not bonded
    }
    response = client.post("/api/selection/parse_expression", json=payload)
    assert response.status_code == 200
    assert response.json()["indices"] == []

    payload_scaled = {
        "structure": struct_dict,
        "expression": "bonded:@0",
        "bond_scale": 2.0,  # Cutoff ~1.24 -> bonded
    }
    response = client.post("/api/selection/parse_expression", json=payload_scaled)
    assert response.status_code == 200
    assert response.json()["indices"] == [1]


def test_parse_labels_api() -> None:
    atoms = Atoms("CHO", positions=[[0, 0, 0], [1, 0, 0], [2, 0, 0]])
    struct_dict = atoms_to_response(atoms).model_dump()

    response = client.post(
        "/api/selection/parse_labels",
        json={"structure": struct_dict, "labels_str": "C1,O1"},
    )
    assert response.status_code == 200
    assert response.json()["indices"] == [0, 2]


def test_filter_position_api_success() -> None:
    atoms = Atoms("H3", positions=[[0, 0, 0], [0, 0, 1], [0, 0, 2]])
    struct_dict = atoms_to_response(atoms).model_dump()

    response = client.post(
        "/api/selection/filter_position",
        json={
            "structure": struct_dict,
            "criteria_str": "z >= 1.0",
            "coord_type": "cartesian",
        },
    )
    assert response.status_code == 200
    assert response.json()["indices"] == [1, 2]


def test_filter_position_api_bad_numeric_returns_400() -> None:
    atoms = Atoms("H2", positions=[[0, 0, 0], [0, 0, 1]])
    struct_dict = atoms_to_response(atoms).model_dump()

    response = client.post(
        "/api/selection/filter_position",
        json={
            "structure": struct_dict,
            "criteria_str": "z >= 1..2",
            "coord_type": "cartesian",
        },
    )
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "errors" in detail
    assert any("Invalid numeric value" in item for item in detail["errors"])


def test_analyze_clusters_api_success() -> None:
    atoms = Atoms(
        "H4",
        positions=[[0, 0, 0], [0, 0, 0.2], [0, 0, 5.0], [0, 0, 5.2]],
    )
    struct_dict = atoms_to_response(atoms).model_dump()

    response = client.post(
        "/api/selection/analyze_clusters",
        json={"structure": struct_dict, "n_clusters": 2, "axis": 2},
    )
    assert response.status_code == 200
    cluster_ids = response.json()["cluster_ids"]
    assert cluster_ids[0] == cluster_ids[1]
    assert cluster_ids[2] == cluster_ids[3]
    assert cluster_ids[0] != cluster_ids[2]
