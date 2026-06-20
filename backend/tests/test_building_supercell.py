import numpy as np
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def get_two_atom_cell():
    return {
        "symbols": ["Na", "Cl"],
        "positions": [[0.0, 0.0, 0.0], [2.0, 2.0, 2.0]],
        "wrapped_positions": [[0.0, 0.0, 0.0], [2.0, 2.0, 2.0]],
        "cell": [[4.0, 0.0, 0.0], [0.0, 4.0, 0.0], [0.0, 0.0, 4.0]],
        "pbc": [True, True, True],
    }


def test_supercell_2x2x1_produces_eight_atoms():
    structure = get_two_atom_cell()

    response = client.post(
        "/api/edit/supercell",
        json={"structure": structure, "repetitions": [2, 2, 1]},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["structure"]["symbols"]) == 8


def test_supercell_doubles_a_axis_cell_vector():
    structure = get_two_atom_cell()

    response = client.post(
        "/api/edit/supercell",
        json={"structure": structure, "repetitions": [2, 1, 1]},
    )

    assert response.status_code == 200
    cell = response.json()["structure"]["cell"]
    # a-axis vector should double from 4.0 to 8.0
    np.testing.assert_allclose(cell[0], [8.0, 0.0, 0.0], rtol=1e-6)


def test_supercell_zero_repetition_returns_400():
    structure = get_two_atom_cell()

    response = client.post(
        "/api/edit/supercell",
        json={"structure": structure, "repetitions": [0, 1, 1]},
    )

    assert response.status_code == 400


def test_supercell_wrong_length_repetitions_returns_400():
    structure = get_two_atom_cell()

    response = client.post(
        "/api/edit/supercell",
        json={"structure": structure, "repetitions": [2, 2]},
    )

    assert response.status_code == 400


def test_supercell_cell_less_structure_returns_400():
    # Structure with no unit cell (zero cell) should be rejected before make_supercell
    # silently piles atoms at duplicate coordinates.
    structure = {
        "symbols": ["H", "H"],
        "positions": [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]],
        "wrapped_positions": [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]],
        "cell": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]],
        "pbc": [False, False, False],
    }

    response = client.post(
        "/api/edit/supercell",
        json={"structure": structure, "repetitions": [2, 2, 2]},
    )

    assert response.status_code == 400


def test_supercell_too_large_returns_400():
    # 2 atoms × 1000×1000×1000 = 2_000_000_000 — far exceeds MAX_SUPERCELL_ATOMS.
    # The guard must reject BEFORE any allocation happens.
    structure = get_two_atom_cell()

    response = client.post(
        "/api/edit/supercell",
        json={"structure": structure, "repetitions": [1000, 1000, 1000]},
    )

    assert response.status_code == 400
