from __future__ import annotations

from fastapi.testclient import TestClient


def _h2o_structure_payload() -> dict[str, object]:
    return {
        "symbols": ["O", "H", "H"],
        "positions": [[0.0, 0.0, 0.0], [0.758, 0.0, 0.504], [-0.758, 0.0, 0.504]],
        "wrapped_positions": [
            [0.0, 0.0, 0.0],
            [0.758, 0.0, 0.504],
            [-0.758, 0.0, 0.504],
        ],
        "cell": [[10.0, 0.0, 0.0], [0.0, 10.0, 0.0], [0.0, 0.0, 10.0]],
        "pbc": [False, False, False],
    }


def test_update_visualization_returns_bond_diagnostics_when_requested(
    client: TestClient,
) -> None:
    payload = {
        "structure": _h2o_structure_payload(),
        "params": {
            "bond_scale": 1.1,
            "h_bond_distance_cutoff": 3.5,
            "h_bond_angle_cutoff": 120.0,
            "bond_overrides": {},
            "bond_inference_mode": "quick",
            "include_bond_diagnostics": True,
        },
    }

    response = client.post("/api/structure/update_visualization", json=payload)
    assert response.status_code == 200, response.text

    body = response.json()
    assert "bond_diagnostics" in body
    diagnostics = body["bond_diagnostics"]
    assert diagnostics["mode"] == "quick"
    assert "quick" in diagnostics["cluster_strategies"]
    assert diagnostics["summary"]["quick"] >= 1


def test_update_visualization_remains_compatible_without_diagnostics(
    client: TestClient,
) -> None:
    payload = {
        "structure": _h2o_structure_payload(),
        "params": {
            "bond_scale": 1.1,
            "h_bond_distance_cutoff": 3.5,
            "h_bond_angle_cutoff": 120.0,
            "bond_overrides": {},
        },
    }

    response = client.post("/api/structure/update_visualization", json=payload)
    assert response.status_code == 200, response.text

    body = response.json()
    assert "bonds" in body
    assert "bond_diagnostics" not in body or body["bond_diagnostics"] is None
