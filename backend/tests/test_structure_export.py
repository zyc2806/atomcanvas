import io
import json

from ase.io import read
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


def test_export_nonperiodic_pdb_downloads_file(client: TestClient) -> None:
    """A non-periodic PDB export must return 200 with a .pdb in content-disposition.

    Regression: previously 500 because ase.io.write(format='pdb') raises
    UnknownFileTypeError — the correct ASE format string is 'proteindatabank'.
    """
    payload = {
        "format": "pdb",
        "scope": "current_frame",
        "structure": _make_structure(periodic=False),
        "structure_version": 5,
    }

    response = client.post("/api/structure/export", json=payload)

    assert response.status_code == 200
    content_disposition = response.headers.get("content-disposition", "")
    assert ".pdb" in content_disposition
    # The body must be a genuinely valid PDB (the 500 was a wrong format string),
    # so round-trip it through ASE's proteindatabank reader and check the atoms.
    atoms = read(io.StringIO(response.content.decode()), format="proteindatabank")
    assert len(atoms) == 2


def test_export_full_trajectory_pdb_truncates_to_valid_first_frame(client: TestClient) -> None:
    """full_trajectory + pdb: pdb can't hold multiple frames, so it truncates to
    the first frame with a TRAJECTORY_TRUNCATED warning and still writes valid PDB
    via the proteindatabank alias (not a 500)."""
    payload = {
        "format": "pdb",
        "scope": "full_trajectory",
        "structure": _make_structure(periodic=False),
        "trajectory": [_make_structure(periodic=False), _make_structure(periodic=False)],
        "structure_version": 7,
    }

    response = client.post("/api/structure/export", json=payload)

    assert response.status_code == 200
    warnings = json.loads(response.headers.get("x-export-warnings", "[]"))
    assert any(w.get("code") == "TRAJECTORY_TRUNCATED" for w in warnings)
    atoms = read(io.StringIO(response.content.decode()), format="proteindatabank")
    assert len(atoms) == 2


def test_export_mol_returns_write_not_supported(client: TestClient) -> None:
    """A mol export must return 409 with code WRITE_NOT_SUPPORTED.

    Regression: previously 500 because ASE has no mol writer.
    """
    payload = {
        "format": "mol",
        "scope": "current_frame",
        "structure": _make_structure(periodic=False),
        "structure_version": 6,
    }

    response = client.post("/api/structure/export", json=payload)

    assert response.status_code == 409
    data = response.json()
    assert data["detail"]["code"] == "WRITE_NOT_SUPPORTED"


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
