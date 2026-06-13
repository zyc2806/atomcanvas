
import pytest
from ase import Atoms
from app.services.geometry import get_bonds_and_ghosts

def test_bond_overrides_delete():
    # Simple H2 molecule
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 0.74]])
    
    # Default behavior: should have 1 bond
    bonds, ghost, _ = get_bonds_and_ghosts(atoms)
    assert len(bonds) == 1
    
    # Override behavior: delete bond 0-1
    overrides = {"0-1": "delete"}
    bonds_override, ghost_override, _ = get_bonds_and_ghosts(atoms, bond_overrides=overrides)
    assert len(bonds_override) == 0

def test_bond_overrides_order():
    # Simple H2 molecule
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 0.74]])
    
    # Default behavior: order 1.0
    bonds, _, _ = get_bonds_and_ghosts(atoms)
    assert bonds[0][2] == 1.0
    
    # Override behavior: set order to 2.0
    overrides = {"0-1": "2.0"}
    bonds_override, _, _ = get_bonds_and_ghosts(atoms, bond_overrides=overrides)
    assert bonds_override[0][2] == 2.0

def test_ghost_bond_format():
    # Periodic system that should generate ghost bonds
    # H atom at 0,0,0 and another at 9.9,0,0 in a 10x10x10 cell -> wraps around
    atoms = Atoms('H2', positions=[[0.1, 0, 0], [9.9, 0, 0]], cell=[10, 10, 10], pbc=True)
    
    bonds, ghosts, _ = get_bonds_and_ghosts(atoms)
    
    # Should have ghosts
    assert len(ghosts) > 0
    
    # Check format: (start, end, u, v, order) -> 5 elements
    first_ghost = ghosts[0]
    assert len(first_ghost) == 5
    assert isinstance(first_ghost[0], tuple) # start pos
    assert isinstance(first_ghost[1], tuple) # end pos
    assert isinstance(first_ghost[2], int)   # atom_i
    assert isinstance(first_ghost[3], int)   # atom_j
    assert isinstance(first_ghost[4], float) # order

def test_manual_bond_creation():
    # Test creating bonds between atoms too far apart for ASE detection
    # Atoms 10Å apart - no natural bond detected
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 10]])
    
    # Without override - no bonds
    bonds, _, _ = get_bonds_and_ghosts(atoms)
    assert len(bonds) == 0
    
    # With override - should have 1 bond with order 1.0
    overrides = {"0-1": "1.0"}
    bonds, _, _ = get_bonds_and_ghosts(atoms, bond_overrides=overrides)
    assert len(bonds) == 1
    assert bonds[0] == (0, 1, 1.0)

def test_manual_bond_order_change():
    # Test changing order of manually-created bond
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 10]])
    
    overrides = {"0-1": "2.0"}
    bonds, _, _ = get_bonds_and_ghosts(atoms, bond_overrides=overrides)
    assert len(bonds) == 1
    assert bonds[0][2] == 2.0  # Order should be 2.0
