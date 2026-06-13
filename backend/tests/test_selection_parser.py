import pytest
import numpy as np
from ase import Atoms
from app.services.selection_parser import parse_selection_expression
from app.routers.selection import cluster_atoms_by_position_logic

@pytest.fixture
def example_atoms():
    # Create a simple structure: CO molecule + some dummy atoms for slab testing
    # CO at origin and z=1.2
    # Slab-like layers at z=0, z=5, z=10
    
    positions = [
        [0, 0, 0],    # 0: C, Layer 1 (z=0)
        [0, 0, 1.2],  # 1: O, Layer 1 (z=1.2 is close to 0 in clustering if spread is large, but let's make layers distinct)
        [5, 5, 5],    # 2: H, Layer 2 (z=5)
        [5, 5, 5.5],  # 3: H, Layer 2 (z=5.5)
        [10, 10, 10], # 4: N, Layer 3 (z=10)
    ]
    symbols = ['C', 'O', 'H', 'H', 'N']
    cell = [20, 20, 20]
    pbc = True
    
    atoms = Atoms(symbols=symbols, positions=positions, cell=cell, pbc=pbc)
    return atoms

def test_elem_selection(example_atoms):
    # elem:C -> index 0
    indices = parse_selection_expression(example_atoms, "elem:C")
    assert indices == [0]
    
    # elem:H -> indices 2, 3
    indices = parse_selection_expression(example_atoms, "elem:H")
    assert sorted(indices) == [2, 3]
    
    # Case insensitive? usually elements are case sensitive or capitalized. 
    # Let's assume standard chemical symbols for now, or match ASE behavior.
    # ASE usually expects 'C', 'H'. 
    # Let's try to be robust if possible, but strict is fine.
    indices = parse_selection_expression(example_atoms, "elem:O")
    assert indices == [1]

def test_label_selection(example_atoms):
    # label:C1 -> index 0 (Assuming 1-based indexing in label string mapping to correct atom)
    # Actually, the previous logic mapped C1 to the first C atom.
    # Let's stick to that convention: Symbol + 1-based index among that symbol's atoms.
    # example_atoms: C(0), O(1), H(2), H(3), N(4)
    # C1 -> index 0
    # O1 -> index 1
    # H1 -> index 2
    # H2 -> index 3
    # N1 -> index 4
    
    assert parse_selection_expression(example_atoms, "label:C1") == [0]
    assert parse_selection_expression(example_atoms, "label:H1") == [2]
    assert parse_selection_expression(example_atoms, "label:H2") == [3]

def test_label_range_selection(example_atoms):
    # label:H1-2 -> indices 2, 3
    indices = parse_selection_expression(example_atoms, "label:H1-2")
    assert sorted(indices) == [2, 3]

def test_label_comma_selection(example_atoms):
    # label:C1,O1 -> indices 0, 1
    indices = parse_selection_expression(example_atoms, "label:C1,O1")
    assert sorted(indices) == [0, 1]
    
    # label:C1,H1-2 -> indices 0, 2, 3
    indices = parse_selection_expression(example_atoms, "label:C1,H1-2")
    assert sorted(indices) == [0, 2, 3]

def test_pos_selection(example_atoms):
    # pos:z<2 -> indices 0, 1
    indices = parse_selection_expression(example_atoms, "pos:z<2")
    assert sorted(indices) == [0, 1]
    
    # pos:x>=5 -> indices 2, 3, 4
    indices = parse_selection_expression(example_atoms, "pos:x>=5")
    assert sorted(indices) == [2, 3, 4]
    
    # pos:y==5 -> indices 2, 3
    indices = parse_selection_expression(example_atoms, "pos:y==5")
    assert sorted(indices) == [2, 3]

def test_frac_selection(example_atoms):
    # Cell is 20x20x20.
    # z=0 -> frac=0
    # z=10 -> frac=0.5
    # z=5 -> frac=0.25
    
    # frac:c>0.4 -> z>8 -> index 4 (z=10)
    indices = parse_selection_expression(example_atoms, "frac:c>0.4")
    assert indices == [4]
    
    # frac:c<=0.25 -> z<=5 -> 0, 1, 2 (z=0, 1.2, 5)
    # Wait, 5/20 = 0.25. So z=5 is included.
    # 5.5/20 = 0.275.
    indices = parse_selection_expression(example_atoms, "frac:c<=0.26")
    assert sorted(indices) == [0, 1, 2]

def test_slab_selection(example_atoms):
    # slab:z,3,1 -> Bottom layer
    # Layers roughly:
    # 1. z=0, 1.2 (indices 0, 1) -> Center ~0.6
    # 2. z=5, 5.5 (indices 2, 3) -> Center ~5.25
    # 3. z=10 (index 4) -> Center 10
    
    # slab:z,3,1 should select indices 0, 1
    indices = parse_selection_expression(example_atoms, "slab:z,3,1")
    assert sorted(indices) == [0, 1]
    
    # slab:z,3,2 -> Middle layer -> 2, 3
    indices = parse_selection_expression(example_atoms, "slab:z,3,2")
    assert sorted(indices) == [2, 3]
    
    # slab:z,3,3 -> Top layer -> 4
    indices = parse_selection_expression(example_atoms, "slab:z,3,3")
    assert sorted(indices) == [4]

def test_boolean_logic(example_atoms):
    # (elem:C OR elem:O) -> 0, 1
    indices = parse_selection_expression(example_atoms, "elem:C OR elem:O")
    assert sorted(indices) == [0, 1]
    
    # elem:H AND pos:z>5.2 -> H at z=5.5 (index 3)
    indices = parse_selection_expression(example_atoms, "elem:H AND pos:z>5.2")
    assert indices == [3]
    
    # NOT elem:H -> 0, 1, 4
    indices = parse_selection_expression(example_atoms, "NOT elem:H")
    assert sorted(indices) == [0, 1, 4]

def test_complex_logic(example_atoms):
    # (elem:C OR elem:O) AND slab:z,3,1
    # (0, 1) AND (0, 1) -> 0, 1
    indices = parse_selection_expression(example_atoms, "(elem:C OR elem:O) AND slab:z,3,1")
    assert sorted(indices) == [0, 1]
    
    # (elem:H) AND (pos:z<5.2 OR pos:z>6)
    # H are 2 (z=5), 3 (z=5.5).
    # z<5.2 -> index 2 matches.
    # z>6 -> no H matches.
    # Result -> 2
    indices = parse_selection_expression(example_atoms, "elem:H AND (pos:z<5.2 OR pos:z>6)")
    assert indices == [2]

def test_case_insensitivity(example_atoms):
    # ELEM:c -> 0
    indices = parse_selection_expression(example_atoms, "ELEM:c")
    assert indices == [0]
    
    # pos:Z<2
    indices = parse_selection_expression(example_atoms, "pos:Z<2")
    assert sorted(indices) == [0, 1]

def test_invalid_syntax(example_atoms):
    with pytest.raises(ValueError) as excinfo:
        parse_selection_expression(example_atoms, "elem:C AND")
    assert "syntax" in str(excinfo.value).lower() or "expected" in str(excinfo.value).lower()

def test_unknown_keyword(example_atoms):
    with pytest.raises(ValueError):
        parse_selection_expression(example_atoms, "foo:bar")

def test_cluster_sorting_logic(example_atoms):
    # Layers at z=0, z=5, z=10
    # Expected:
    # z=0, 1.2 -> cluster 0
    # z=5, 5.5 -> cluster 1
    # z=10 -> cluster 2
    
    # 3 clusters along z (axis=2)
    labels = cluster_atoms_by_position_logic(example_atoms, n_clusters=3, axis=2)
    
    # Check indices 0, 1 (z=0, 1.2) are labeled 0
    assert labels[0] == 0
    assert labels[1] == 0
    
    # Check indices 2, 3 (z=5, 5.5) are labeled 1
    assert labels[2] == 1
    assert labels[3] == 1
    
    # Check index 4 (z=10) is labeled 2
    assert labels[4] == 2

