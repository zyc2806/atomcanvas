"""
Tests for the aromatic-ring display toggle's backend half: alongside the 1.5
aromatic bond order (single-line + torus look), the RDKit full path must also
emit a parallel ``kekule_orders`` map giving each formerly-aromatic bond its
Kekulé order (1.0 / 2.0). The frontend swaps to these when the user hides the
aromatic torus, redrawing benzene as alternating single/double bonds.

The map is keyed by the canonical "min-max" bond id (shared with bond_overrides
and the frontend toBondId), and is surfaced both via the ``kekule_out`` out-param
of ``get_bonds_and_ghosts`` and on the ``Visualization`` response.
"""

import pytest

pytest.importorskip("rdkit")

from ase import Atoms

from app.services.geometry import get_bonds_and_ghosts
from app.services.structure_utils import atoms_to_response


def _atoms_from_smiles(smiles: str) -> Atoms:
    """Build a 3D ASE Atoms object from SMILES via RDKit ETKDG + MMFF."""
    from rdkit import Chem
    from rdkit.Chem import AllChem

    mol = Chem.MolFromSmiles(smiles)
    assert mol is not None, f"bad SMILES: {smiles}"
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    assert AllChem.EmbedMolecule(mol, params) == 0, f"embed failed: {smiles}"
    AllChem.MMFFOptimizeMolecule(mol)
    conf = mol.GetConformer()
    symbols = [a.GetSymbol() for a in mol.GetAtoms()]
    positions = [
        [conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y, conf.GetAtomPosition(i).z]
        for i in range(mol.GetNumAtoms())
    ]
    return Atoms(symbols=symbols, positions=positions)


def _bond_id(u: int, v: int) -> str:
    return f"{min(u, v)}-{max(u, v)}"


def test_benzene_kekule_orders_alternate_around_ring():
    atoms = _atoms_from_smiles("c1ccccc1")
    kekule: dict[str, float] = {}
    bonds, _ghosts, _rings = get_bonds_and_ghosts(
        atoms, bond_inference_mode="full", kekule_out=kekule
    )

    # The six ring C-C bonds stay aromatic (1.5) so the ON look is unchanged.
    aromatic = [(u, v) for u, v, o in bonds if o == 1.5]
    assert len(aromatic) == 6

    # Every aromatic bond has a Kekulé entry; values are strictly 1 or 2.
    for u, v in aromatic:
        assert _bond_id(u, v) in kekule
    assert len(kekule) == 6
    assert set(kekule.values()) <= {1.0, 2.0}

    # A valid Kekulé structure for benzene is a perfect matching: exactly three
    # double bonds, three single, and each ring carbon in exactly one double.
    doubles = [bid for bid, order in kekule.items() if order == 2.0]
    assert len(doubles) == 3
    double_atoms = []
    for bid in doubles:
        a, b = bid.split("-")
        double_atoms.extend([int(a), int(b)])
    assert len(set(double_atoms)) == 6  # all six carbons matched exactly once


def test_atoms_to_response_surfaces_kekule_orders():
    atoms = _atoms_from_smiles("c1ccccc1")
    response = atoms_to_response(atoms)

    kekule = response.visualization.kekule_orders
    assert kekule is not None
    assert len(kekule) == 6
    assert set(kekule.values()) <= {1.0, 2.0}


def test_pyridine_kekule_orders_present_and_binary():
    # Heteroatom ring: the N-containing aromatic ring must still Kekulize cleanly.
    atoms = _atoms_from_smiles("c1ccncc1")
    kekule: dict[str, float] = {}
    bonds, _ghosts, _rings = get_bonds_and_ghosts(
        atoms, bond_inference_mode="full", kekule_out=kekule
    )

    aromatic = [(u, v) for u, v, o in bonds if o == 1.5]
    assert len(aromatic) == 6
    assert len(kekule) == 6
    assert set(kekule.values()) <= {1.0, 2.0}
    # Three double bonds around the six-membered pyridine ring.
    assert sum(1 for o in kekule.values() if o == 2.0) == 3


def test_naphthalene_fused_rings_kekule_sane():
    # Fused bicyclic: 11 aromatic bonds (10 perimeter + 1 shared edge).
    atoms = _atoms_from_smiles("c1ccc2ccccc2c1")
    kekule: dict[str, float] = {}
    bonds, _ghosts, _rings = get_bonds_and_ghosts(
        atoms, bond_inference_mode="full", kekule_out=kekule
    )

    aromatic = [(u, v) for u, v, o in bonds if o == 1.5]
    assert len(aromatic) == 11
    assert len(kekule) == 11
    assert set(kekule.values()) <= {1.0, 2.0}
    # Naphthalene's Kekulé structure has five double bonds.
    assert sum(1 for o in kekule.values() if o == 2.0) == 5


def test_non_aromatic_molecule_has_no_kekule_orders():
    # Ethane: no aromatic bonds, so no Kekulé map entries.
    atoms = _atoms_from_smiles("CC")
    kekule: dict[str, float] = {}
    bonds, _ghosts, _rings = get_bonds_and_ghosts(
        atoms, bond_inference_mode="full", kekule_out=kekule
    )
    assert all(o != 1.5 for _u, _v, o in bonds)
    assert kekule == {}
