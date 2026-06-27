import ase
import numpy as np
import uuid
from typing import Dict, List, Optional, cast
from ase.constraints import FixAtoms

from ..models import StandardStructureObject, Structure, Visualization
from .geometry import get_bonds_and_ghosts, calc_h_bond_geometries


def _generate_atom_labels(atoms: ase.Atoms) -> List[str]:
    """Generates consistent labels like C1, C2, H1 (based on element count)."""
    labels = []
    element_counts = {}
    for atom in atoms:
        symbol = atom.symbol
        count = element_counts.get(symbol, 0) + 1
        element_counts[symbol] = count
        labels.append(f"{symbol}{count}")
    return labels


def atoms_from_dict(structure_dict: dict[str, object]) -> ase.Atoms:
    """
    Creates an ASE Atoms object from a dictionary representation.
    This function correctly handles constraints.
    Supports both StandardStructureObject (nested) and flat dicts.
    """
    # Create a deep copy to avoid modifying the original dict
    data = structure_dict.copy()

    # Handle nested structure if present
    if "structure" in data:
        struct_data = cast(dict[str, object], data["structure"])
        # Merge visualization if present at top level to handle fixed_atoms
        if "visualization" in data and "visualization" not in struct_data:
            struct_data["visualization"] = data["visualization"]
        data = struct_data

    # Extract fixed atoms indices from visualization data if present
    visualization_data = cast(dict[str, object], data.get("visualization", {}))
    fixed_atoms_raw = cast(list[int] | None, visualization_data.get("fixed_atoms"))
    fixed_atoms_indices = fixed_atoms_raw or []

    symbols = cast(list[str] | None, data.get("symbols")) or []
    positions = (
        cast(list[tuple[float, float, float]] | None, data.get("positions")) or []
    )
    cell = cast(list[list[float]] | None, data.get("cell"))
    pbc_raw = cast(tuple[bool, bool, bool] | list[bool] | None, data.get("pbc"))
    pbc = tuple(pbc_raw) if pbc_raw is not None else None

    # Build the Atoms object
    atoms = ase.Atoms(
        symbols=symbols,
        positions=positions,
        cell=cell,
        pbc=pbc,
    )

    ids = cast(list[object] | None, data.get("ids"))
    if ids is None or len(ids) != len(atoms):
        ids = [uuid.uuid4().hex for _ in range(len(atoms))]
    else:
        ids = [str(value) for value in ids]

    atoms.new_array("uuid", np.array(ids))

    # Apply constraints if any fixed atoms are specified
    if fixed_atoms_indices:
        constraint = FixAtoms(indices=fixed_atoms_indices)
        atoms.set_constraint(constraint)

    return atoms


def wrap_atoms_for_display(atoms: ase.Atoms) -> ase.Atoms:
    """Return a copy with atoms wrapped into the unit cell for periodic structures.

    The renderer draws atoms and regular bonds from the serialized positions, while
    cross-boundary "ghost" bond stubs are computed in the wrapped basis. If the input
    atoms are not already inside the cell (symmetry-expanded P1 CIFs, slabs,
    super-cells, translated/edited structures), those two bases disagree and bonds
    render as fragments spanning the whole cell. Wrapping once here, before bonds are
    computed and before serialization, makes raw == wrapped everywhere so atoms,
    regular bonds, and ghost stubs all line up (VESTA-style PBC rendering).

    Non-periodic structures (or periodic ones with a degenerate/zero cell) are
    returned unchanged. The copy preserves custom arrays (uuid) and constraints.
    """
    if not (atoms.pbc.any() and np.any(atoms.get_cell())):
        return atoms
    wrapped = atoms.copy()
    try:
        wrapped.wrap()
    except Exception:
        # A degenerate cell can make wrap() raise; fall back to the original atoms
        # rather than failing the whole request.
        return atoms
    return wrapped


def atoms_to_structure(atoms: ase.Atoms) -> Structure:
    wrapped_positions = atoms.get_positions()
    if atoms.pbc.any() and np.any(atoms.get_cell()):
        try:
            wrapped_positions = atoms.get_positions(wrap=True)
        except Exception:
            pass

    if "uuid" in atoms.arrays:
        ids = [str(value) for value in atoms.arrays["uuid"].tolist()]
    else:
        ids = [uuid.uuid4().hex for _ in range(len(atoms))]

    pbc_list = [bool(value) for value in atoms.get_pbc().tolist()]
    pbc: tuple[bool, bool, bool] = (
        bool(pbc_list[0]),
        bool(pbc_list[1]),
        bool(pbc_list[2]),
    )

    return Structure(
        symbols=atoms.get_chemical_symbols(),
        positions=cast(
            list[tuple[float, float, float]], atoms.get_positions().tolist()
        ),
        wrapped_positions=cast(
            list[tuple[float, float, float]], wrapped_positions.tolist()
        ),
        cell=cast(
            list[list[float]] | None,
            atoms.cell.array.tolist() if np.any(atoms.cell.array) else None,
        ),
        pbc=pbc,
        ids=ids,
    )


def atoms_to_response(
    atoms: ase.Atoms,
    bond_scale: float = 1.2,
    bond_overrides: Optional[Dict[str, str]] = None,
    h_bond_distance_cutoff: float = 3.5,
    h_bond_angle_cutoff: float = 120.0,
) -> StandardStructureObject:
    """
    Converts a modified ASE Atoms object back into the standard response format,
    recalculating visualization data correctly.
    """
    if bond_overrides is None:
        bond_overrides = {}

    # Compute geometry (bonds + ghost stubs + H-bonds) in the WRAPPED (in-cell)
    # basis so regular bonds and cross-boundary ghost stubs line up with the
    # displayed wrapped_positions and nothing spans the whole cell. The canonical
    # `atoms` (and the serialized `positions`) stay RAW so /export, edits, and the
    # translate(wrap=false) toggle round-trip the user's original coordinates.
    # For non-periodic structures geom_atoms == atoms (no-op).
    geom_atoms = wrap_atoms_for_display(atoms)

    # 1. Extract constraints and find fixed atoms
    fixed_atoms_indices: list[int] = []
    if atoms.constraints:
        for constr in atoms.constraints:
            if isinstance(constr, FixAtoms):
                fixed_atoms_indices.extend(constr.get_indices())

    # 2. Calculate Geometry (Bonds & Ghost Bonds) in the wrapped basis
    kekule_orders: Dict[str, float] = {}
    bonds, wrapped_ghost_bonds, rings = get_bonds_and_ghosts(
        geom_atoms, bond_scale=bond_scale, bond_overrides=bond_overrides, kekule_out=kekule_orders
    )

    wrapped_h_bonds, unwrapped_h_bonds = calc_h_bond_geometries(
        geom_atoms,
        distance_cutoff=h_bond_distance_cutoff,
        angle_cutoff=h_bond_angle_cutoff,
    )

    atom_labels = _generate_atom_labels(atoms)

    # Use Pydantic models for validation and serialization
    return StandardStructureObject(
        structure=atoms_to_structure(atoms),
        visualization=Visualization(
            bonds=cast(list[tuple[int, int, float]], bonds),
            rings=cast(list[tuple[list[float], list[float], float]], rings),
            wrapped_ghost_bonds=cast(
                list[
                    tuple[
                        tuple[float, float, float],
                        tuple[float, float, float],
                        int,
                        int,
                        float,
                    ]
                ],
                wrapped_ghost_bonds,
            ),
            h_bond_geometries=cast(
                list[tuple[list[float], list[float]]], wrapped_h_bonds
            ),
            unwrapped_h_bonds=cast(
                list[tuple[list[float], list[float]]], unwrapped_h_bonds
            ),
            labels=atom_labels,
            fixed_atoms=sorted(set(int(index) for index in fixed_atoms_indices)),
            kekule_orders=kekule_orders,
        ),
    )
