import numpy as np
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def get_box_structure():
    return {
        "symbols": ["H"],
        "positions": [[0.9, 0.5, 0.5]],
        "wrapped_positions": [[0.9, 0.5, 0.5]],
        "cell": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        "pbc": [True, True, True],
    }


def get_skewed_cell_structure():
    return {
        "symbols": ["H"],
        "positions": [[0.0, 0.0, 0.0]],
        "wrapped_positions": [[0.0, 0.0, 0.0]],
        "cell": [[5.0, 0.0, 0.0], [2.0, 4.0, 0.0], [0.0, 0.0, 5.0]],
        "pbc": [True, True, True],
    }


def get_molecule_structure():
    return {
        "symbols": ["H", "O", "H"],
        "positions": [[0.0, 0.0, 0.0], [0.0, 1.0, 0.0], [1.0, 1.0, 0.0]],
        "wrapped_positions": [[0.0, 0.0, 0.0], [0.0, 1.0, 0.0], [1.0, 1.0, 0.0]],
        "cell": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]],
        "pbc": [False, False, False],
    }


def test_cartesian_translation_moves_positions_by_vector():
    structure = get_molecule_structure()
    vector = [1.0, -2.0, 0.5]

    response = client.post(
        "/api/edit/translate_structure",
        json={
            "structure": structure,
            "translation_vector": vector,
            "vector_type": "cartesian",
        },
    )

    assert response.status_code == 200
    positions = response.json()["structure"]["positions"]
    expected = np.array(structure["positions"]) + np.array(vector)
    np.testing.assert_allclose(positions, expected, rtol=1e-6)


def test_lattice_translation_uses_cell_vectors():
    structure = get_skewed_cell_structure()
    vector = [0.5, 0.5, 0.0]

    response = client.post(
        "/api/edit/translate_structure",
        json={
            "structure": structure,
            "translation_vector": vector,
            "vector_type": "lattice",
        },
    )

    assert response.status_code == 200
    actual = response.json()["structure"]["positions"][0]
    # 0.5*a + 0.5*b = [2.5,0,0] + [1.0,2.0,0] = [3.5, 2.0, 0.0]
    np.testing.assert_allclose(actual, [3.5, 2.0, 0.0], rtol=1e-6)


def test_wrap_keeps_atoms_inside_cell():
    structure = get_box_structure()

    response = client.post(
        "/api/edit/translate_structure",
        json={
            "structure": structure,
            "translation_vector": [1.1, 0.0, 0.0],
            "vector_type": "lattice",
            "wrap": True,
        },
    )

    assert response.status_code == 200
    positions = response.json()["structure"]["positions"]
    for pos in positions:
        for coord in pos:
            # cubic cell of length 1 -> every coordinate must stay inside [0, 1)
            assert -1e-9 <= coord < 1.0 + 1e-9


def test_lattice_translation_no_cell_returns_400():
    structure = get_molecule_structure()

    response = client.post(
        "/api/edit/translate_structure",
        json={
            "structure": structure,
            "translation_vector": [0.5, 0.0, 0.0],
            "vector_type": "lattice",
        },
    )

    assert response.status_code == 400
    assert "cell" in response.json()["detail"].lower()
