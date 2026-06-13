import pytest
from ase import Atoms
from app.services.selection_parser import select_by_bonded, select_by_extend

def test_bonded_select_with_delete():
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 0.74]])
    overrides = {"0-1": "delete"}
    selected = select_by_bonded(atoms, [0], bond_overrides=overrides)
    assert 1 not in selected
    assert len(selected) == 0

def test_bonded_select_with_add():
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 10.0]])
    overrides = {"0-1": "1.0"}
    selected = select_by_bonded(atoms, [0], bond_overrides=overrides)
    assert 1 in selected

def test_extend_select_with_overrides():
    atoms = Atoms('H3', positions=[[0, 0, 0], [0, 0, 0.74], [0, 0, 10.0]])
    overrides = {"1-2": "1.0"}
    selected = select_by_extend(atoms, [0], hops=2, bond_overrides=overrides)
    assert 1 in selected
    assert 2 in selected
    assert len(selected) == 3

def test_bond_scale_impact():
    atoms = Atoms('H2', positions=[[0, 0, 0], [0, 0, 1.0]])
    
    selected_default = select_by_bonded(atoms, [0])
    assert 1 not in selected_default
    
    selected_scaled = select_by_bonded(atoms, [0], bond_scale=2.0)
    assert 1 in selected_scaled
