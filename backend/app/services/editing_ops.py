from __future__ import annotations

import numpy as np
from ase import Atoms


def translate_structure_in_atoms(
    atoms: Atoms,
    translation_vector,
    vector_type: str,
    wrap: bool,
) -> Atoms:
    translated = atoms.copy()
    vector = np.array(translation_vector, dtype=float)
    cell = translated.get_cell()
    if vector_type == "cartesian":
        translated.translate(vector)
    elif vector_type == "lattice":
        if np.allclose(np.asarray(cell), 0):
            raise ValueError(
                "Lattice translation requires a unit cell with non-zero volume."
            )
        translated.translate(np.dot(vector, np.asarray(cell)))
    else:
        raise ValueError(f"Unknown vector_type: {vector_type}")
    if wrap and bool(translated.pbc.any()):
        translated.wrap()
    return translated
