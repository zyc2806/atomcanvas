"""
Unit tests for advanced selection methods: sphere, bonded, pct, extend, fixed.
"""
import pytest
import numpy as np
from ase import Atoms
from ase.build import molecule, bulk
from ase.constraints import FixAtoms

from app.services.selection_parser import (
    parse_selection_expression,
    get_selection_ast,
    select_by_sphere,
    select_by_bonded,
    select_by_percentile,
    select_by_extend,
    select_fixed,
)


class TestSphereSelection:
    """Tests for sphere selection."""

    def test_sphere_coordinate_center(self):
        """Test sphere selection with coordinate center."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [1, 0, 0], [5, 0, 0], [10, 0, 0]])
        result = parse_selection_expression(atoms, 'sphere:0,0,0,2')
        assert 0 in result
        assert 1 in result
        assert 2 not in result
        assert 3 not in result

    def test_sphere_atom_center(self):
        """Test sphere selection with atom index as center."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [1, 0, 0], [5, 0, 0], [10, 0, 0]])
        result = parse_selection_expression(atoms, 'sphere:@0,2')
        assert 0 in result
        assert 1 in result
        assert 2 not in result

    def test_sphere_empty_result(self):
        """Test sphere with no atoms in range."""
        atoms = Atoms('H2', positions=[[0, 0, 0], [100, 0, 0]])
        result = parse_selection_expression(atoms, 'sphere:50,50,50,1')
        assert len(result) == 0

    def test_sphere_all_atoms(self):
        """Test sphere that covers all atoms."""
        atoms = Atoms('H3', positions=[[0, 0, 0], [1, 0, 0], [2, 0, 0]])
        result = parse_selection_expression(atoms, 'sphere:1,0,0,10')
        assert len(result) == 3

    def test_sphere_pbc(self):
        """Test sphere selection with periodic boundary conditions."""
        # Create a periodic cell with atom near edge
        atoms = Atoms('H2', positions=[[0.1, 0, 0], [9.9, 0, 0]], cell=[10, 10, 10], pbc=True)
        # Sphere at origin should catch both if PBC is handled
        result = select_by_sphere(atoms, [0, 0, 0], 0.5)
        assert 0 in result  # 0.1 from origin
        assert 1 in result  # 0.1 from origin via PBC

    def test_sphere_ast(self):
        """Test AST generation for sphere."""
        ast = get_selection_ast('sphere:1,2,3,4.5')
        assert ast['type'] == 'selector'
        assert ast['kind'] == 'sphere'
        assert ast['center'] == [1, 2, 3]
        assert ast['radius'] == 4.5


class TestBondedSelection:
    """Tests for bonded selection."""

    def test_bonded_single_atom(self):
        """Test selecting neighbors of a single atom."""
        mol = molecule('H2O')
        result = parse_selection_expression(mol, 'bonded:@0')
        # Atom 0 (O) is bonded to atoms 1 and 2 (H)
        assert 1 in result or 2 in result
        assert len(result) >= 1

    def test_bonded_with_or(self):
        """Test selecting neighbors of multiple atoms via OR."""
        mol = molecule('H2O')
        result = parse_selection_expression(mol, 'bonded:@1 OR bonded:@2')
        assert 0 in result

    def test_bonded_isolated_atom(self):
        """Test bonded selection on isolated atoms."""
        atoms = Atoms('H2', positions=[[0, 0, 0], [100, 0, 0]])
        result = parse_selection_expression(atoms, 'bonded:@0')
        # No neighbors at this distance
        assert len(result) == 0

    def test_bonded_ast(self):
        """Test AST generation for bonded."""
        ast = get_selection_ast('bonded:@1')
        assert ast['type'] == 'selector'
        assert ast['kind'] == 'bonded'
        assert ast['targets'] == [1]


class TestPercentileSelection:
    """Tests for percentile selection."""

    def test_pct_upper_half(self):
        """Test selecting top 50% atoms in Z."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3]])
        result = parse_selection_expression(atoms, 'pct:z,50,100')
        assert 2 in result
        assert 3 in result
        assert 0 not in result

    def test_pct_lower_quarter(self):
        """Test selecting bottom 25% atoms."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3]])
        result = parse_selection_expression(atoms, 'pct:z,0,25')
        assert 0 in result
        assert 3 not in result

    def test_pct_x_axis(self):
        """Test percentile on X axis."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])
        result = parse_selection_expression(atoms, 'pct:x,75,100')
        assert 3 in result

    def test_pct_y_axis(self):
        """Test percentile on Y axis."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]])
        result = parse_selection_expression(atoms, 'pct:y,0,50')
        assert 0 in result
        assert 1 in result

    def test_pct_ast(self):
        """Test AST generation for percentile."""
        ast = get_selection_ast('pct:z,25,75')
        assert ast['type'] == 'selector'
        assert ast['kind'] == 'pct'
        assert ast['axis'] == 'z'
        assert ast['min'] == 25
        assert ast['max'] == 75


class TestExtendSelection:
    """Tests for extend (N-hop) selection."""

    def test_extend_1_hop(self):
        """Test 1-hop extension."""
        mol = molecule('C2H6')  # Ethane: C-C with H attached
        result = parse_selection_expression(mol, 'extend:@0;1')
        assert 0 in result
        assert len(result) > 1  # Should include neighbors

    def test_extend_2_hops(self):
        """Test 2-hop extension."""
        mol = molecule('C2H6')
        result = parse_selection_expression(mol, 'extend:@0;2')
        # Should get more atoms than 1-hop
        result_1hop = parse_selection_expression(mol, 'extend:@0;1')
        assert len(result) >= len(result_1hop)

    def test_extend_0_hops(self):
        """Test 0-hop extension (just the atom itself)."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])
        result = parse_selection_expression(atoms, 'extend:@1;0')
        assert result == [1]

    def test_extend_from_h_atoms(self):
        """Test extension from H atom reaches O."""
        mol = molecule('H2O')
        result = parse_selection_expression(mol, 'extend:@1;1')
        assert 0 in result

    def test_extend_ast(self):
        """Test AST generation for extend."""
        ast = get_selection_ast('extend:@0;2')
        assert ast['type'] == 'selector'
        assert ast['kind'] == 'extend'
        assert ast['targets'] == [0]
        assert ast['hops'] == 2


class TestConnectedSelection:
    """Tests for connected components selection."""

    def test_connected_simple_pair(self):
        """Test simple bonded pair (select 0 -> 0,1)."""
        mol = molecule('H2')
        result = parse_selection_expression(mol, 'connected:@0')
        assert 0 in result
        assert 1 in result
        assert len(result) == 2

    def test_connected_disconnected_components(self):
        """Test disconnected components (select 0 -> component A only)."""
        # Two water molecules far apart
        atoms = molecule('H2O')
        mol2 = molecule('H2O')
        mol2.translate([10, 0, 0])
        atoms += mol2
        
        # Select from first water molecule
        result = parse_selection_expression(atoms, 'connected:@0')
        assert 0 in result
        assert 1 in result
        assert 2 in result
        assert 3 not in result
        assert 4 not in result
        assert 5 not in result
        assert len(result) == 3

    def test_connected_multiple_targets(self):
        """Test multiple targets (select 0,3 -> A + B)."""
        atoms = molecule('H2O')
        mol2 = molecule('H2O')
        mol2.translate([10, 0, 0])
        atoms += mol2
        
        # Select from both molecules
        result = parse_selection_expression(atoms, 'connected:@0,@3')
        assert len(result) == 6
        for i in range(6):
            assert i in result

    def test_connected_ast(self):
        """Test AST generation for connected."""
        ast = get_selection_ast('connected:@0,@1')
        assert ast['type'] == 'selector'
        assert ast['kind'] == 'connected'
        assert ast['targets'] == [0, 1]


class TestFixedSelection:
    """Tests for fixed atoms selection."""

    def test_fixed_with_constraints(self):
        """Test selecting atoms with FixAtoms constraint."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])
        atoms.set_constraint(FixAtoms(indices=[0, 2]))
        result = parse_selection_expression(atoms, 'fixed')
        assert 0 in result
        assert 2 in result
        assert 1 not in result
        assert 3 not in result

    def test_fixed_no_constraints(self):
        """Test fixed selection with no constraints."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])
        result = parse_selection_expression(atoms, 'fixed')
        assert len(result) == 0

    def test_fixed_multiple_constraints(self):
        """Test fixed selection with multiple FixAtoms constraints."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])
        atoms.set_constraint([FixAtoms(indices=[0]), FixAtoms(indices=[3])])
        result = parse_selection_expression(atoms, 'fixed')
        assert 0 in result
        assert 3 in result

    def test_fixed_ast(self):
        """Test AST generation for fixed."""
        ast = get_selection_ast('fixed')
        assert ast['type'] == 'selector'
        assert ast['kind'] == 'fixed'


class TestBooleanCombinations:
    """Test boolean combinations with new selectors."""

    def test_sphere_and_elem(self):
        """Test sphere AND element combination."""
        atoms = Atoms('CH4', positions=[[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0]])
        result = parse_selection_expression(atoms, 'sphere:0,0,0,1.5 AND elem:H')
        # Should only include H atoms within sphere
        for idx in result:
            assert atoms[idx].symbol == 'H'

    def test_fixed_or_pos(self):
        """Test fixed OR position combination."""
        atoms = Atoms('H4', positions=[[0, 0, 0], [0, 0, 5], [0, 0, 10], [0, 0, 15]])
        atoms.set_constraint(FixAtoms(indices=[0]))
        result = parse_selection_expression(atoms, 'fixed OR pos:z>8')
        assert 0 in result  # Fixed
        assert 2 in result  # z=10
        assert 3 in result  # z=15

    def test_not_bonded(self):
        """Test NOT bonded combination."""
        mol = molecule('H2O')
        result = parse_selection_expression(mol, 'NOT bonded:@0')
        # Should exclude atoms bonded to atom 0
        bonded_result = parse_selection_expression(mol, 'bonded:@0')
        for idx in result:
            assert idx not in bonded_result
