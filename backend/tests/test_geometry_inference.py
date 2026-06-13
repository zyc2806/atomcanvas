import numpy as np
from ase import Atoms
from ase.build import molecule, bulk
from app.services.geometry import get_bonds_and_ghosts


class TestGeometryInference:
    def test_benzene_aromaticity(self):
        """
        Benzene (C6H6) should have 1.5 bond order for C-C bonds
        and 1.0 for C-H bonds.
        """
        atoms = molecule("C6H6")

        # Get basic bonds first to pass to inference
        bonds_w_order, _, _ = get_bonds_and_ghosts(atoms)
        # get_bonds_and_ghosts calls infer_bond_orders internally now,
        # so bonds_w_order should already have correct orders!

        c_c_bonds = []
        for i, j, order in bonds_w_order:
            sym_i = atoms.symbols[i]
            sym_j = atoms.symbols[j]
            if sym_i == "C" and sym_j == "C":
                c_c_bonds.append(order)

        assert len(c_c_bonds) == 6
        assert all(o == 1.5 for o in c_c_bonds), (
            f"Expected 1.5 for aromatic C-C, got {c_c_bonds}"
        )

    def test_co2_double_bonds(self):
        """
        CO2 should have 2.0 bond order for C=O bonds.
        """
        # Linear CO2: O=C=O
        # d(C=O) approx 1.16 A
        atoms = Atoms("CO2", positions=[[0, 0, 0], [0, 0, 1.16], [0, 0, -1.16]])

        bonds_w_order, _, _ = get_bonds_and_ghosts(atoms)

        assert len(bonds_w_order) == 2
        for _, _, order in bonds_w_order:
            assert order == 2.0, f"Expected 2.0 for C=O, got {order}"

    def test_sf6_hypervalent(self):
        """
        SF6 (Sulfur Hexafluoride) is hypervalent.
        S should form 6 single bonds with F.
        """
        # Manual construction of octahedral SF6
        bond_length = 1.56
        atoms = Atoms("S", positions=[[0, 0, 0]])
        atoms.extend(
            Atoms(
                "F6",
                positions=[
                    [bond_length, 0, 0],
                    [-bond_length, 0, 0],
                    [0, bond_length, 0],
                    [0, -bond_length, 0],
                    [0, 0, bond_length],
                    [0, 0, -bond_length],
                ],
            )
        )

        bonds_w_order, _, _ = get_bonds_and_ghosts(atoms)

        assert len(bonds_w_order) == 6
        for _, _, order in bonds_w_order:
            assert order == 1.0, f"Expected 1.0 for S-F, got {order}"

    def test_graphene_pbc(self):
        from ase.build import graphene

        atoms = graphene(formula="C2", a=2.46, thickness=0.0)
        atoms.cell[2, 2] = 20.0

        bonds_w_order, ghost_bonds, _ = get_bonds_and_ghosts(atoms)

        c_c_bond_orders = [
            order
            for i, j, order in bonds_w_order
            if atoms.symbols[i] == "C" and atoms.symbols[j] == "C"
        ]

        if not c_c_bond_orders:
            c_c_bond_orders = [
                order
                for _start, _end, u, v, order in ghost_bonds
                if atoms.symbols[u] == "C" and atoms.symbols[v] == "C"
            ]

        assert len(c_c_bond_orders) > 0
        # The Kekulé logic generates alternating single/double bonds (1.0/2.0)
        # for aromatic systems like graphene, replacing the old 1.5 average.
        # This provides a "snapshot" of the resonance structures, which is
        # necessary for localized bond representations in visualization.
        # Thus, we assert that bond orders are either 1.0 or 2.0.
        assert all(o in [1.0, 2.0] for o in c_c_bond_orders), (
            f"Expected 1.0 or 2.0 for graphene C-C, got {c_c_bond_orders}"
        )

    def test_fcc_ag_ghost_segments_are_finite_and_bounded(self):
        atoms = bulk("Ag", "fcc", a=4.0857, cubic=True)
        atoms.set_pbc(True)

        regular_bonds, ghost_bonds, _ = get_bonds_and_ghosts(atoms, bond_scale=1.0)

        assert regular_bonds or ghost_bonds, (
            "Expected periodic FCC Ag to expose covalent connectivity"
        )

        if not ghost_bonds:
            return

        cell_extent = float(np.sum(np.linalg.norm(atoms.cell.array, axis=1)))
        max_expected_segment = cell_extent * 1.5

        segment_lengths = []
        for start, end, _u, _v, _order in ghost_bonds:
            start_arr = np.array(start, dtype=float)
            end_arr = np.array(end, dtype=float)

            assert np.all(np.isfinite(start_arr)), (
                f"Ghost bond start contains non-finite values: {start}"
            )
            assert np.all(np.isfinite(end_arr)), (
                f"Ghost bond end contains non-finite values: {end}"
            )

            segment_lengths.append(float(np.linalg.norm(end_arr - start_arr)))

        assert max(segment_lengths) <= max_expected_segment, (
            f"Ghost bond segment unexpectedly long: max={max(segment_lengths):.6f}, "
            f"allowed<={max_expected_segment:.6f}"
        )

    def test_unwrapped_offset_bond_is_not_forced_to_ghost(self):
        atoms = Atoms(
            "CC",
            positions=[[1.0, 1.0, 1.0], [1.0, 1.0, 11.9]],
            cell=[[10.0, 0.0, 0.0], [0.0, 10.0, 0.0], [0.0, 0.0, 10.0]],
            pbc=[True, True, True],
        )

        bonds_w_order, ghost_bonds, _ = get_bonds_and_ghosts(atoms, bond_scale=1.0)

        assert len(bonds_w_order) == 1
        assert {bonds_w_order[0][0], bonds_w_order[0][1]} == {0, 1}
        assert ghost_bonds == []

    def test_true_boundary_crossing_bond_remains_ghost(self):
        atoms = Atoms(
            "CC",
            positions=[[1.0, 1.0, 0.1], [1.0, 1.0, 9.9]],
            cell=[[10.0, 0.0, 0.0], [0.0, 10.0, 0.0], [0.0, 0.0, 10.0]],
            pbc=[True, True, True],
        )

        bonds_w_order, ghost_bonds, _ = get_bonds_and_ghosts(atoms, bond_scale=1.0)

        assert all({u, v} != {0, 1} for u, v, _ in bonds_w_order)
        assert any({u, v} == {0, 1} for _start, _end, u, v, _order in ghost_bonds)

    def test_small_cell_cross_boundary_pair_is_still_ghost(self):
        atoms = Atoms(
            "CC",
            positions=[[1.8, 0.0, 0.0], [0.6, 0.0, 0.0]],
            cell=[[2.0, 0.0, 0.0], [0.0, 10.0, 0.0], [0.0, 0.0, 10.0]],
            pbc=[True, False, False],
        )

        regular_bonds, ghost_bonds, _ = get_bonds_and_ghosts(atoms, bond_scale=1.0)

        assert all({u, v} != {0, 1} for u, v, _ in regular_bonds)
        assert any({u, v} == {0, 1} for _start, _end, u, v, _order in ghost_bonds)
