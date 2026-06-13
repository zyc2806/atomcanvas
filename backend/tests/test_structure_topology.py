
import pytest
from ase import Atoms
from app.services.geometry import get_structure_topology

def test_topology_natural_neighbors():
    # H2 molecule - should have 1 bond
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 0.74]])
    topology = get_structure_topology(atoms, bond_scale=1.2)
    assert len(topology) == 1
    # Check content - expected format (u, v, offset)
    bond = list(topology)[0]
    assert len(bond) == 3
    assert tuple(sorted((bond[0], bond[1]))) == (0, 1)

def test_topology_delete_override():
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 0.74]])
    overrides = {"0-1": "delete"}
    topology = get_structure_topology(atoms, bond_scale=1.2, bond_overrides=overrides)
    assert len(topology) == 0

def test_topology_delete_override_case_insensitive():
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 0.74]])
    overrides = {"0-1": "DELETE"}
    topology = get_structure_topology(atoms, bond_scale=1.2, bond_overrides=overrides)
    assert len(topology) == 0

def test_topology_add_override():
    # Two H atoms far apart - no natural bond
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 10.0]])
    overrides = {"0-1": "1.0"} # Adding a bond
    topology = get_structure_topology(atoms, bond_scale=1.2, bond_overrides=overrides)
    assert len(topology) == 1
    bond = list(topology)[0]
    assert tuple(sorted((bond[0], bond[1]))) == (0, 1)
    # New bonds should have (0,0,0) offset
    assert bond[2] == (0, 0, 0)

def test_topology_add_override_existing():
    # H2 molecule - already bonded
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 0.74]])
    overrides = {"0-1": "2.0"} # Changing order, but topology implies existence
    topology = get_structure_topology(atoms, bond_scale=1.2, bond_overrides=overrides)
    assert len(topology) == 1
    # Should still exist
    bond = list(topology)[0]
    assert tuple(sorted((bond[0], bond[1]))) == (0, 1)

def test_topology_pbc():
    # Periodic system
    atoms = Atoms('H2', positions=[[0.1, 0, 0], [9.9, 0, 0]], cell=[10, 10, 10], pbc=True)
    topology = get_structure_topology(atoms, bond_scale=1.2)
    assert len(topology) == 1
    bond = list(topology)[0]
    # Check offset is correct for wrapping
    # One atom is at 0.1, other at 9.9. Distance is 0.2 across boundary.
    # Offset depends on direction.
    # The set should contain ONE entry for this pair.
    assert bond[2] != (0, 0, 0)
