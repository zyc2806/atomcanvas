"""
Regression tests for aromatic-ring false positives.

The primary RDKit path is correct, but when RDKit returns nothing (absent, or
``DetermineBondOrders`` raises for radicals / charged / dangling-bond fragments
typical of DFT clusters), the heuristic fallback used to flag *every* 5/6-member
C/N/O/S ring as aromatic — giving saturated rings (cyclohexane, cyclohexene)
bogus aromatic torus markers and 1.5 bond orders.

These tests pin both the RDKit path and the fallback path (RDKit forced to
return nothing) against a panel of aromatic and saturated rings.
"""

import pytest
from ase import Atoms

from app.services.geometry import get_bonds_and_ghosts


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


def _counts(atoms):
    # Force the "full" strategy so the test deterministically exercises the
    # RDKit -> Kekulé/heuristic fallback chain.
    bonds, _ghosts, rings = get_bonds_and_ghosts(atoms, bond_inference_mode="full")
    n_aromatic_bonds = sum(1 for _i, _j, o in bonds if o == 1.5)
    return len(rings), n_aromatic_bonds, bonds


AROMATIC = {
    "benzene": "c1ccccc1",
    "pyridine": "c1ccncc1",
    "furan": "c1ccoc1",
    "naphthalene": "c1ccc2ccccc2c1",
}

NON_AROMATIC = {
    "cyclohexane": "C1CCCCC1",
    "cyclohexene": "C1CCC=CC1",
    "cyclopentane": "C1CCCC1",
    "thf": "C1CCOC1",
    "piperidine": "C1CCNCC1",
}


@pytest.fixture
def force_rdkit_failure(monkeypatch):
    """Force the RDKit bond-order step to return nothing -> heuristic fallback."""
    monkeypatch.setattr(
        "app.services.geometry.detect_bonds_rdkit",
        lambda *a, **k: ([], []),
    )


class TestRDKitPath:
    @pytest.mark.parametrize("name", list(AROMATIC))
    def test_aromatics_have_rings(self, name):
        n_rings, _arom, _bonds = _counts(_atoms_from_smiles(AROMATIC[name]))
        assert n_rings >= 1, f"{name} should be flagged aromatic"

    @pytest.mark.parametrize("name", list(NON_AROMATIC))
    def test_saturated_rings_not_aromatic(self, name):
        n_rings, n_arom, _bonds = _counts(_atoms_from_smiles(NON_AROMATIC[name]))
        assert n_rings == 0, f"{name} must not get an aromatic torus"
        assert n_arom == 0, f"{name} must not get 1.5 bond orders"


class TestFallbackPath:
    @pytest.mark.parametrize("name", list(AROMATIC))
    def test_aromatics_still_detected(self, force_rdkit_failure, name):
        n_rings, _arom, _bonds = _counts(_atoms_from_smiles(AROMATIC[name]))
        assert n_rings >= 1, f"{name} aromatic ring lost when RDKit is down"

    @pytest.mark.parametrize("name", list(NON_AROMATIC))
    def test_saturated_rings_not_false_positive(self, force_rdkit_failure, name):
        n_rings, n_arom, _bonds = _counts(_atoms_from_smiles(NON_AROMATIC[name]))
        assert n_rings == 0, f"{name} got a false aromatic torus in fallback"
        assert n_arom == 0, f"{name} got false 1.5 bond orders in fallback"

    def test_cyclohexene_double_bond_survives(self, force_rdkit_failure):
        _n_rings, _arom, bonds = _counts(_atoms_from_smiles(NON_AROMATIC["cyclohexene"]))
        n_double = sum(1 for _i, _j, o in bonds if o == 2.0)
        assert n_double >= 1, "cyclohexene C=C should remain a double bond"
