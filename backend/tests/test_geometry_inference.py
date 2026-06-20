import numpy as np
from pathlib import Path
from ase import Atoms
from ase.build import molecule, bulk
from ase.io import read as ase_read
from app.services.geometry import get_bonds_and_ghosts

# Path to the shared fixtures directory (repo-root/fixtures)
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures"


class TestBenzeneUpload:
    """BUG 1 regression: benzene C-H bonds must not vanish on upload.

    At bond_scale=1.0 the C-H distance (1.087 A) exceeds the covalent cutoff
    (1.070 A), so the 6 H atoms are skipped and the under-coordinated carbons
    gain spurious triple bonds.  The upload route must use bond_scale=1.2.
    """

    def test_benzene_upload_has_12_bonds_via_api(self, client):
        """POST /api/structure/upload with benzene.xyz returns 12 bonds
        (6 C-H order 1.0 + 6 C-C order 1.5) and NO order-3.0 triple bonds."""
        fixture = FIXTURES_DIR / "benzene.xyz"
        with open(fixture, "rb") as fh:
            response = client.post(
                "/api/structure/upload",
                files={"file": ("benzene.xyz", fh, "chemical/x-xyz")},
            )
        assert response.status_code == 200, response.text
        data = response.json()

        symbols = data["structure"]["symbols"]
        bonds = data["visualization"]["bonds"]  # [[i, j, order], ...]

        assert len(bonds) == 12, (
            f"Expected 12 bonds (6 C-H + 6 C-C), got {len(bonds)}: {bonds}"
        )

        ch_bonds = [
            (i, j, o)
            for i, j, o in bonds
            if {symbols[i], symbols[j]} == {"C", "H"}
        ]
        cc_bonds = [
            (i, j, o)
            for i, j, o in bonds
            if {symbols[i], symbols[j]} == {"C", "C"}
        ]

        assert len(ch_bonds) == 6, (
            f"Expected 6 C-H bonds, got {len(ch_bonds)}: {ch_bonds}"
        )
        assert all(o == 1.0 for _, _, o in ch_bonds), (
            f"All C-H bonds should have order 1.0, got: {ch_bonds}"
        )

        assert len(cc_bonds) == 6, (
            f"Expected 6 C-C bonds, got {len(cc_bonds)}: {cc_bonds}"
        )
        assert all(o == 1.5 for _, _, o in cc_bonds), (
            f"All C-C bonds should be aromatic (order 1.5), got: {cc_bonds}"
        )

        triple_bonds = [(i, j, o) for i, j, o in bonds if o == 3.0]
        assert triple_bonds == [], (
            f"Spurious triple bonds detected: {triple_bonds}"
        )

    def test_benzene_geometry_layer_has_12_bonds_at_scale_1_2(self):
        """Calling get_bonds_and_ghosts at bond_scale=1.2 directly returns 12 bonds."""
        atoms = ase_read(str(FIXTURES_DIR / "benzene.xyz"))
        bonds, _, _ = get_bonds_and_ghosts(atoms, bond_scale=1.2)
        assert len(bonds) == 12, (
            f"Expected 12 bonds at bond_scale=1.2, got {len(bonds)}: {bonds}"
        )


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

    def test_ghost_stub_does_not_overshoot_when_atom_is_on_the_cell_face(self):
        # BUG 1: a cross-boundary bond should be truncated AT the cell boundary on
        # BOTH atoms. When an atom sits exactly on the face it bonds across (a
        # fractional coord of 0 — extremely common in CIF crystals), the ray-cell
        # intersection degenerates to t=0 (the atom is already on the face). The old
        # code treated that zero-length result as a failure and substituted a fixed
        # 0.5 A fallback stub pointing OUTSIDE the cell, so one atom's bond stopped
        # at the boundary while the on-face atom's stub overshot past it ("只在其中
        # 一个原子上"). Every ghost stub endpoint must stay within the cell.
        cell = 5.0
        atoms = Atoms(
            "CC",
            # Atom 0 is exactly on the -x face (x = 0.0); the pair bonds only across
            # that face (within-cell distance 3.6 A is non-bonding, across is 1.4 A).
            positions=[[0.0, 2.5, 2.5], [3.6, 2.5, 2.5]],
            cell=[cell, cell, cell],
            pbc=True,
        )

        _regular, ghost_bonds, _ = get_bonds_and_ghosts(atoms)

        assert ghost_bonds, "Expected a cross-boundary ghost stub"

        inv_cell = np.linalg.inv(np.array(atoms.cell.array, dtype=float))
        tol = 1e-6
        for start, end, _u, _v, _order in ghost_bonds:
            for label, point in (("start", start), ("end", end)):
                frac = np.dot(np.array(point, dtype=float), inv_cell)
                assert np.all(frac >= -tol) and np.all(frac <= 1.0 + tol), (
                    f"Ghost stub {label} {tuple(round(c, 3) for c in point)} "
                    f"(frac {frac.round(3).tolist()}) overshoots outside the cell"
                )


def _ghost_stub_lengths_with_bond_lengths(atoms):
    """Return per-emitted-stub (stub_length, bond_length) pairs.

    A ghost stub belongs to one periodic bond whose true vector is the input to
    the ray-cell intersection helper. We spy on that helper to recover, per
    crossing pair, the wrapped start point of each side and the full bond vector
    (`true_vec`). Each emitted stub's start point is matched back to a side so we
    can pair its length against the parent bond length. This lets us assert that
    no stub spans more than half of its own bond (the boundary split), without
    re-deriving the periodic image arithmetic in the test.
    """
    from app.services import geometry as geometry_module

    original = geometry_module._get_cell_intersections_vectorized
    captured = []

    def spy(start, directions, cell):
        out = original(start, directions, cell)
        captured.append((np.array(start, dtype=float), np.array(directions, dtype=float)))
        return out

    geometry_module._get_cell_intersections_vectorized = spy
    try:
        # diagnostics={} bypasses the content-fingerprint cache so the spy fires.
        _regular, ghost_bonds, _ = get_bonds_and_ghosts(atoms, diagnostics={})
    finally:
        geometry_module._get_cell_intersections_vectorized = original

    # Two helper calls: call 0 starts at the u-side wrapped positions with +true_vec,
    # call 1 starts at the v-side wrapped positions with -true_vec. Each side's
    # outward stub direction is `directions` and |directions| == the bond length.
    # An atom can start several ghost pairs from the same wrapped point, so we
    # disambiguate by also requiring the stub to point along that side's outward
    # direction (not merely share its start point).
    sides = []  # list of (start_point, outward_unit_dir, bond_length)
    for starts, dirs in captured:
        for s, d in zip(starts, dirs):
            length = float(np.linalg.norm(d))
            if length < 1e-8:
                continue
            sides.append((s, d / length, length))

    results = []
    for start, end, _u, _v, _order in ghost_bonds:
        start_arr = np.array(start, dtype=float)
        stub_vec = np.array(end, dtype=float) - start_arr
        stub_len = float(np.linalg.norm(stub_vec))
        stub_dir = stub_vec / stub_len if stub_len > 1e-8 else stub_vec
        bond_len = None
        for s, unit_dir, length in sides:
            if np.allclose(s, start_arr, atol=1e-5) and float(
                np.dot(stub_dir, unit_dir)
            ) > 0.999:
                bond_len = length
                break
        results.append((stub_len, bond_len))
    return ghost_bonds, results


class TestPeriodicGhostBondGeometry:
    """BUG 2 regression: periodic (ghost) bonds must be symmetric, inside-cell,
    and must not span the whole bond across the cell.

    A cross-boundary bond is rendered as two stubs, one from each wrapped atom,
    each clipped at the cell face its half crosses. The two stubs together
    represent the single bond split by the boundary. Both stubs must stay inside
    the cell, and neither may exceed half of the bond length (the boundary split
    point), so no stub spans the full bond (~4 A) across the cell.

    An atom that genuinely sits exactly on the face it bonds across has a
    degenerate near-zero in-cell stub on that side which is legitimately dropped;
    that is the only permitted source of one-sidedness.
    """

    FIXTURES = ["nacl.cif", "nacl_supercell.cif", "slab.cif"]

    def _read(self, name):
        return ase_read(str(FIXTURES_DIR / name))

    def test_ghost_stubs_stay_inside_the_cell(self):
        # Every stub endpoint (both ends) must have fractional coords in [0, 1].
        tol = 1e-6
        for name in self.FIXTURES:
            atoms = self._read(name)
            inv_cell = np.linalg.inv(np.array(atoms.cell.array, dtype=float))
            _regular, ghost_bonds, _ = get_bonds_and_ghosts(atoms)
            assert ghost_bonds, f"{name}: expected cross-boundary ghost stubs"
            for start, end, _u, _v, _order in ghost_bonds:
                for label, point in (("start", start), ("end", end)):
                    frac = np.dot(np.array(point, dtype=float), inv_cell)
                    assert np.all(frac >= -tol) and np.all(frac <= 1.0 + tol), (
                        f"{name}: ghost stub {label} "
                        f"(frac {frac.round(3).tolist()}) overshoots outside the cell"
                    )

    def test_ghost_stubs_do_not_span_the_full_bond_across_the_cell(self):
        # No stub may run the entire bond across the cell. A cross-boundary bond
        # is split at the cell face: each side reaches only the face its half
        # crosses, so a faithful stub covers at most the larger of the two pieces
        # (empirically up to ~0.67 of the bond on these fixtures). When the
        # neighbouring image lands exactly on the far face the boundary crossing
        # degenerates to the full bond (ratio ~1.0-1.4 in the old code); the fix
        # clips that case to the bond midpoint (ratio 0.5). Bound: stub_length is
        # strictly below the full bond, asserted as <= 0.95 * bond_length, which
        # rejects any full-bond / cell-spanning stub while leaving faithful
        # asymmetric boundary crossings (<= ~0.67) untouched.
        max_ratio = 0.95
        for name in self.FIXTURES:
            atoms = self._read(name)
            _ghosts, pairs = _ghost_stub_lengths_with_bond_lengths(atoms)
            assert pairs, f"{name}: expected ghost stubs to measure"
            for stub_len, bond_len in pairs:
                assert bond_len is not None, (
                    f"{name}: could not match a stub to its parent bond"
                )
                assert stub_len <= max_ratio * bond_len, (
                    f"{name}: ghost stub spans {stub_len:.3f} A of a "
                    f"{bond_len:.3f} A bond (ratio {stub_len / bond_len:.3f}); "
                    f"a stub running the full bond spans the cell"
                )

    def test_off_face_atoms_always_emit_a_stub_symmetry(self):
        # Symmetry: for every crossing pair, an atom that is NOT exactly on the
        # face it bonds across must emit a stub. The only permitted one-sidedness
        # is genuine on-face degeneracy. We classify on-face via the ray-cell exit
        # parameter (t ~ 0 => the atom is on its crossing face), then assert each
        # off-face side actually appears in the RETURNED ghost_bonds (matched by
        # start position + bond direction) rather than re-deriving the production
        # clip — so this cannot pass spuriously if the clip fraction ever changes.
        from app.services import geometry as geometry_module

        def emits(start_pos, direction, ghost_bonds):
            for s, e, _i, _j, _o in ghost_bonds:
                if np.allclose(np.array(s, dtype=float), start_pos, atol=1e-5):
                    stub = np.array(e, dtype=float) - np.array(s, dtype=float)
                    if np.linalg.norm(stub) > 1e-8 and float(np.dot(stub, direction)) > 0:
                        return True
            return False

        for name in self.FIXTURES:
            atoms = self._read(name)
            original = geometry_module._get_cell_intersections_vectorized
            captured = []

            def spy(start, directions, cell):
                out = original(start, directions, cell)
                captured.append(
                    (
                        np.array(start, dtype=float),
                        np.array(directions, dtype=float),
                        np.array(out, dtype=float),
                    )
                )
                return out

            geometry_module._get_cell_intersections_vectorized = spy
            try:
                # diagnostics={} bypasses the cache so the spy always fires.
                _regular, ghost_bonds, _ = get_bonds_and_ghosts(atoms, diagnostics={})
            finally:
                geometry_module._get_cell_intersections_vectorized = original

            assert len(captured) == 2, f"{name}: expected u-side and v-side calls"
            (su, du, iu), (sv, _dv, iv) = captured

            off_face_dropped = 0
            both_emit_when_possible = 0
            eligible_pairs = 0
            for k in range(len(su)):
                d = du[k]
                dn = float(np.linalg.norm(d))
                if dn < 1e-8:
                    continue
                # Exit parameter along the bond for each side (intersection = start + t*d).
                t_u = float(np.dot(iu[k] - su[k], d) / (dn * dn))
                t_v = float(np.dot(iv[k] - sv[k], -d) / (dn * dn))
                u_on_face = t_u < 1e-6
                v_on_face = t_v < 1e-6
                # Assert against the REAL returned ghost_bonds (matched by start
                # position + bond direction), not a re-derivation of the clip.
                u_emits = emits(su[k], d, ghost_bonds)
                v_emits = emits(sv[k], -d, ghost_bonds)
                if (not u_on_face) and (not u_emits):
                    off_face_dropped += 1
                if (not v_on_face) and (not v_emits):
                    off_face_dropped += 1
                if (not u_on_face) and (not v_on_face):
                    eligible_pairs += 1
                    if u_emits and v_emits:
                        both_emit_when_possible += 1

            assert off_face_dropped == 0, (
                f"{name}: {off_face_dropped} off-face atom sides emitted no stub "
                f"(broad asymmetry); only on-face degeneracy may be dropped"
            )
            # Where neither atom is on its crossing face, BOTH stubs are emitted.
            assert both_emit_when_possible == eligible_pairs, (
                f"{name}: {eligible_pairs - both_emit_when_possible} of "
                f"{eligible_pairs} fully off-face pairs are one-sided"
            )
