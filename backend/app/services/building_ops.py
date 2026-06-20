from __future__ import annotations

import numpy as np
from ase import Atoms
from ase.build import make_supercell

MAX_SUPERCELL_ATOMS = 500_000


def build_supercell_atoms(atoms: Atoms, repetitions) -> Atoms:
    if len(repetitions) != 3:
        raise ValueError("Repetitions must be a list of 3 integers.")
    if any(int(v) <= 0 for v in repetitions):
        raise ValueError("Repetitions must be positive integers.")
    nx, ny, nz = (int(v) for v in repetitions)
    cell = np.asarray(atoms.get_cell())
    if np.allclose(cell, 0):
        raise ValueError("Supercell requires a unit cell with non-zero volume.")
    total = nx * ny * nz * len(atoms)
    if total > MAX_SUPERCELL_ATOMS:
        raise ValueError(
            f"Supercell too large: {total} atoms exceeds the {MAX_SUPERCELL_ATOMS} limit."
        )
    return make_supercell(atoms, [[nx, 0, 0], [0, ny, 0], [0, 0, nz]])
