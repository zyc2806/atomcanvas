import json

from fastapi.testclient import TestClient


def _make_structure(periodic: bool = False) -> dict[str, object]:
    cell = [[10.0, 0.0, 0.0], [0.0, 10.0, 0.0], [0.0, 0.0, 10.0]] if periodic else None
    return {
        "symbols": ["H", "O"],
        "positions": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.96]],
        "wrapped_positions": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.96]],
        "cell": cell,
        "pbc": [periodic, periodic, periodic],
        "ids": ["a1", "a2"],
    }


def test_export_current_frame_xyz_downloads_file(client: TestClient) -> None:
    payload = {
        "format": "xyz",
        "scope": "current_frame",
        "structure": _make_structure(periodic=False),
        "structure_version": 1,
    }

    response = client.post("/api/structure/export", json=payload)

    assert response.status_code == 200
    assert "attachment" in response.headers.get("content-disposition", "")
    assert ".xyz" in response.headers.get("content-disposition", "")


def test_export_periodic_to_pdb_returns_conflict(client: TestClient) -> None:
    payload = {
        "format": "pdb",
        "scope": "current_frame",
        "structure": _make_structure(periodic=True),
        "structure_version": 2,
    }

    response = client.post("/api/structure/export", json=payload)

    assert response.status_code == 409
    data = response.json()
    assert data["detail"]["code"] == "PERIODIC_NOT_SUPPORTED"


def test_export_constraints_warning_emitted_for_xyz(client: TestClient) -> None:
    payload = {
        "format": "xyz",
        "scope": "current_frame",
        "structure": _make_structure(periodic=False),
        "fixed_atoms": [0],
        "structure_version": 3,
    }

    response = client.post("/api/structure/export", json=payload)

    assert response.status_code == 200
    warnings_raw = response.headers.get("x-export-warnings", "[]")
    warnings = json.loads(warnings_raw)
    assert any(w.get("code") == "CONSTRAINTS_DROPPED" for w in warnings)


def test_export_full_trajectory_to_static_has_truncated_warning(client: TestClient) -> None:
    payload = {
        "format": "xyz",
        "scope": "full_trajectory",
        "structure": _make_structure(periodic=False),
        "trajectory": [_make_structure(periodic=False), _make_structure(periodic=False)],
        "structure_version": 4,
    }

    response = client.post("/api/structure/export", json=payload)

    assert response.status_code == 200
    warnings_raw = response.headers.get("x-export-warnings", "[]")
    warnings = json.loads(warnings_raw)
    assert any(w.get("code") == "TRAJECTORY_TRUNCATED" for w in warnings)
