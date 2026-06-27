"""PBC ghost-bond anchoring regression.

BUG (CIF cross-boundary bonds span the whole cell): the renderer draws atoms and
regular bonds from ``structure.positions`` (the serialized coordinates), but the
backend builds cross-boundary "ghost" bond stubs from WRAPPED coordinates. When a
structure's atoms are not already inside the cell (symmetry-expanded P1 CIFs,
slabs, super-cells, translated/edited structures), every ghost stub starts a full
lattice vector away from where its atom is actually drawn -> bonds that visually
span the entire unit cell.

The invariant: every ghost bond's *start* point must coincide with the position
the renderer draws that atom at. The renderer draws periodic structures in the
WRAPPED basis (``structure.wrapped_positions``) while geometry is computed there
too, so the ghost stubs anchor to wrapped_positions. The canonical
``structure.positions`` stays RAW (export/edit/measurement source of truth).
"""

import numpy as np
from ase import Atoms
from ase.build import bulk

from app.services.structure_utils import atoms_to_response
from app.services.geometry_cache import BONDS_CACHE


def _ghost_start_gaps(atoms: Atoms) -> list[float]:
    """Return, for every ghost stub, the distance between its start point and the
    DISPLAYED (wrapped) position of the atom it is supposed to attach to."""
    BONDS_CACHE.clear()
    response = atoms_to_response(atoms)
    wrapped = np.asarray(response.structure.wrapped_positions, dtype=float)
    gaps: list[float] = []
    for start, _end, atom_idx, _other_idx, _order in response.visualization.wrapped_ghost_bonds:
        gaps.append(float(np.linalg.norm(np.asarray(start, dtype=float) - wrapped[atom_idx])))
    return gaps


def test_canonical_positions_stay_raw_for_export_and_edit():
    """The serialized `positions` must remain the user's ORIGINAL (un-wrapped)
    coordinates so /export, translate(wrap=false), and measurements round-trip
    the file faithfully; only `wrapped_positions` is the in-cell display basis."""
    raw = [[-0.7, 2.0, 2.0], [0.7, 2.0, 2.0]]
    atoms = Atoms("ClCl", positions=raw, cell=[4.0, 4.0, 4.0], pbc=True)
    BONDS_CACHE.clear()
    response = atoms_to_response(atoms)
    assert np.allclose(response.structure.positions, raw, atol=1e-9), (
        "atoms_to_response must NOT mutate/wrap the canonical positions"
    )
    # wrapped_positions IS the in-cell basis (atom 0 wraps -0.7 -> 3.3).
    assert np.isclose(response.structure.wrapped_positions[0][0], 4.0 - 0.7, atol=1e-9)


def test_cl2_straddling_boundary_ghost_stubs_attach_to_drawn_atoms():
    """A Cl-Cl bond (1.4 A) straddling the x=0 face: both ghost stubs must start
    exactly at the drawn atom positions, not a lattice vector away."""
    atoms = Atoms("ClCl", positions=[[-0.7, 2.0, 2.0], [0.7, 2.0, 2.0]], cell=[4.0, 4.0, 4.0], pbc=True)
    gaps = _ghost_start_gaps(atoms)
    assert gaps, "expected at least one cross-boundary ghost stub for the straddling Cl2"
    assert max(gaps) < 1e-6, (
        f"ghost stubs detached from their atoms (max gap {max(gaps):.3f} A); "
        "stubs are anchored to wrapped coords while atoms render at the serialized coords"
    )


def test_translated_rocksalt_ghost_stubs_attach_to_drawn_atoms():
    """NaCl rocksalt translated out of the box (atoms outside the cell): no ghost
    stub may start a full lattice vector from the atom the renderer draws."""
    a = 5.64
    rock = bulk("NaCl", "rocksalt", a=a) * (2, 2, 2)
    rock.translate([0.45 * a, -0.30 * a, 0.0])
    gaps = _ghost_start_gaps(rock)
    assert gaps, "expected cross-boundary ghost stubs for the translated rocksalt super-cell"
    assert max(gaps) < 1e-6, (
        f"ghost stubs detached from their atoms (max gap {max(gaps):.3f} A); "
        "cross-cell-spanning bond artifact for non-pre-wrapped CIFs"
    )
