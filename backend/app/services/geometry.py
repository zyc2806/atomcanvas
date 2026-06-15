import numpy as np
import scipy.sparse
import logging
from typing import List, Tuple, Any, Set, Dict, Optional, cast, Literal
from collections import defaultdict
from ase import Atoms
from ase.neighborlist import natural_cutoffs, neighbor_list, NeighborList
from ase.geometry import find_mic
from app.services.chem_utils import (
    is_transition_metal,
    is_lanthanide_actinide,
    is_alkali_alkaline,
    is_metal,
    ELEMENT_CLASSES,
)
from app.services.rdkit_bridge import detect_bonds_rdkit
from app.services.heuristics import ValencePropagator, EnhancedAromaticityDetector
from app.services.kekule import KekuleStructureGenerator


logger = logging.getLogger(__name__)


# --- DEBUG UTILITY ---
def debug_log(*args):
    logger.debug("[GEOMETRY DEBUG] %s", " ".join(str(arg) for arg in args))


def _get_cell_intersections_vectorized(
    start_pos_cart: np.ndarray, directions_cart: np.ndarray, cell: np.ndarray
) -> np.ndarray:
    """
    Vectorized calculation of multiple ray intersections with unit cell boundaries.
    """
    debug_log(
        f"_get_cell_intersections_vectorized called with {directions_cart.shape[0]} vectors."
    )
    if directions_cart.shape[0] == 0:
        return np.empty((0, 3))

    # Handle zero-volume cells (1D/2D periodic systems) by adding a dummy 3rd dimension
    eff_cell = cell.copy()
    if abs(np.linalg.det(eff_cell)) < 1e-9:
        v1, v2, v3 = eff_cell
        if np.linalg.norm(v3) < 1e-9:
            # 2D case: add normal vector
            v3_new = np.cross(v1, v2)
            if np.linalg.norm(v3_new) < 1e-9:
                # 1D case: add two normal vectors
                # Find a vector not parallel to v1
                dummy = (
                    np.array([1.0, 0.0, 0.0])
                    if abs(v1[0]) < 0.9
                    else np.array([0.0, 1.0, 0.0])
                )
                v2_new = np.cross(v1, dummy)
                v3_new = np.cross(v1, v2_new)
                eff_cell[1] = v2_new / np.linalg.norm(v2_new) * 10.0
                eff_cell[2] = v3_new / np.linalg.norm(v3_new) * 10.0
            else:
                eff_cell[2] = v3_new / np.linalg.norm(v3_new) * 10.0

        # Re-check volume, if still 0 (e.g. all vectors 0), abort
        if abs(np.linalg.det(eff_cell)) < 1e-9:
            debug_log("Cell has zero volume after dummy expansion, returning empty.")
            return np.empty((0, 3))

    inv_cell = np.linalg.inv(eff_cell)
    start_pos_frac = np.dot(start_pos_cart, inv_cell)
    directions_frac = np.dot(directions_cart, inv_cell)

    small_direction_mask = np.abs(directions_frac) < 1e-12

    t_to_boundaries_0 = np.full_like(directions_frac, np.inf, dtype=float)
    t_to_boundaries_1 = np.full_like(directions_frac, np.inf, dtype=float)
    np.divide(
        -start_pos_frac,
        directions_frac,
        out=t_to_boundaries_0,
        where=~small_direction_mask,
    )
    np.divide(
        1 - start_pos_frac,
        directions_frac,
        out=t_to_boundaries_1,
        where=~small_direction_mask,
    )

    t_vals = np.hstack([t_to_boundaries_0, t_to_boundaries_1])

    t_vals[t_vals < -1e-9] = np.inf

    min_t = np.min(t_vals, axis=1)

    safe_min_t = np.where(np.isfinite(min_t), min_t, 0.0)

    intersection_points_frac = (
        start_pos_frac + safe_min_t[:, np.newaxis] * directions_frac
    )
    intersection_points_cart = np.dot(intersection_points_frac, cell)

    debug_log(f"Returning {len(intersection_points_cart)} intersection points.")
    return intersection_points_cart


def find_hydrogen_bonds(
    atoms: Atoms, distance_cutoff: float = 3.5, angle_cutoff: float = 120
) -> List[Tuple[int, int, np.ndarray]]:
    """
    Vectorized hydrogen bond finder.
    Filters to ensure each Hydrogen donor only participates in its strongest (shortest) H-bond.
    """
    debug_log("\n--- Starting find_hydrogen_bonds ---")
    symbols = np.array(atoms.get_chemical_symbols())
    positions = atoms.get_positions()

    donors_acceptors_mask = np.isin(symbols, ["N", "O", "F"])
    da_indices = np.where(donors_acceptors_mask)[0]
    h_indices = np.where(symbols == "H")[0]

    debug_log(
        f"Found {len(da_indices)} potential donors/acceptors and {len(h_indices)} hydrogens."
    )

    if len(da_indices) < 2 or len(h_indices) == 0:
        debug_log("Not enough D/A or H to form H-bonds, returning empty list.")
        return []

    cutoffs = natural_cutoffs(atoms, mult=cast(Any, 1.2))
    nl_i, nl_j = neighbor_list("ij", atoms, cutoffs)

    is_da_i = np.isin(nl_i, da_indices)
    is_h_j = np.isin(nl_j, h_indices)
    is_h_i = np.isin(nl_i, h_indices)
    is_da_j = np.isin(nl_j, da_indices)

    dh_mask = (is_da_i & is_h_j) | (is_h_i & is_da_j)

    donor_indices = np.where(dh_mask, np.where(is_da_i, nl_i, nl_j), -1)
    hydrogen_indices = np.where(dh_mask, np.where(is_h_j, nl_j, nl_i), -1)

    donor_indices = donor_indices[donor_indices != -1]
    hydrogen_indices = hydrogen_indices[hydrogen_indices != -1]

    debug_log(f"Found {len(donor_indices)} covalently bonded D-H pairs.")
    if len(donor_indices) == 0:
        return []

    nl_i_da, nl_j_da, nl_S_da = neighbor_list(
        "ijS", atoms, {("H", s): distance_cutoff for s in ["N", "O", "F"]}
    )

    h_nl_mask = np.isin(nl_i_da, h_indices)
    a_nl_mask = np.isin(nl_j_da, da_indices)
    ha_mask = h_nl_mask & a_nl_mask

    h_candidates = nl_i_da[ha_mask]
    a_candidates = nl_j_da[ha_mask]
    S_candidates = nl_S_da[ha_mask]
    debug_log(
        f"Found {len(h_candidates)} potential H...A pairs within distance cutoff."
    )

    h_to_d_map = dict(zip(hydrogen_indices, donor_indices))

    d_of_h_candidates = np.array([h_to_d_map.get(h, -1) for h in h_candidates])

    valid_h_mask = d_of_h_candidates != -1
    h_c, a_c, S_c, d_c = (
        h_candidates[valid_h_mask],
        a_candidates[valid_h_mask],
        S_candidates[valid_h_mask],
        d_of_h_candidates[valid_h_mask],
    )
    debug_log(f"Filtered to {len(h_c)} H...A pairs where H is bonded to a donor.")

    no_pbc_mask = np.all(S_c == 0, axis=1)
    different_atom_mask = d_c != a_c
    valid_mask = ~no_pbc_mask | different_atom_mask

    h_c, a_c, S_c, d_c = (
        h_c[valid_mask],
        a_c[valid_mask],
        S_c[valid_mask],
        d_c[valid_mask],
    )
    debug_log(f"Filtered to {len(h_c)} pairs after removing D-H...D self-interactions.")

    if len(h_c) == 0:
        return []

    pos_d, pos_h, pos_a = positions[d_c], positions[h_c], positions[a_c]
    pos_a_shifted = pos_a + np.einsum("ij,jk->ik", S_c, atoms.cell)

    vec_dh = positions[h_c] - positions[d_c]
    if atoms.pbc.any():
        vec_dh, _ = find_mic(vec_dh, atoms.cell, cast(Any, atoms.pbc))

    vec_ha = pos_a_shifted - pos_h

    norm_dh = np.linalg.norm(vec_dh, axis=1)
    norm_ha = np.linalg.norm(vec_ha, axis=1)

    dot_product = np.einsum("ij,ij->i", -vec_dh, vec_ha)

    valid_norms = (norm_dh > 1e-6) & (norm_ha > 1e-6)
    angles = np.full(len(h_c), 0.0)

    cos_angle = np.clip(
        dot_product[valid_norms] / (norm_dh[valid_norms] * norm_ha[valid_norms]),
        -1.0,
        1.0,
    )
    angles[valid_norms] = np.degrees(np.arccos(cos_angle))
    debug_log(f"Calculated {len(angles)} angles.")

    # 1. 初步筛选：角度达标
    angle_mask = angles > angle_cutoff

    filtered_h = h_c[angle_mask]
    filtered_a = a_c[angle_mask]
    filtered_S = S_c[angle_mask]
    filtered_dist = norm_ha[angle_mask]

    if len(filtered_h) == 0:
        return []

    # 2. 排序：按距离从小到大排序
    sort_indices = np.argsort(filtered_dist)
    sorted_h = filtered_h[sort_indices]
    sorted_a = filtered_a[sort_indices]
    sorted_S = filtered_S[sort_indices]

    # 3. 去重：每个 H 只保留第一个（即距离最近的那个）
    _, unique_h_indices = np.unique(sorted_h, return_index=True)

    # 4. 获取最终结果
    final_h = sorted_h[unique_h_indices]
    final_a = sorted_a[unique_h_indices]
    final_S = sorted_S[unique_h_indices]

    num_final_bonds = len(final_h)
    debug_log(f"Found {num_final_bonds} H-bonds after filtering for unique donor H.")
    debug_log("--- Finished find_hydrogen_bonds ---\n")

    return list(zip(final_h.tolist(), final_a.tolist(), final_S))


def calc_h_bond_geometries(
    atoms: Atoms, distance_cutoff: float = 3.5, angle_cutoff: float = 120
) -> Tuple[list[Any], list[Any]]:
    # Pass parameters to the finder
    h_bonds_info = find_hydrogen_bonds(atoms, distance_cutoff, angle_cutoff)
    wrapped_geometries = []

    if not h_bonds_info:
        return [], []

    h_indices, a_indices, S_vectors = zip(*h_bonds_info)
    h_indices, a_indices, S_vectors = (
        np.array(h_indices),
        np.array(a_indices),
        np.array(S_vectors),
    )

    cell = atoms.get_cell()
    wrapped_positions = atoms.get_positions(wrap=True)

    pos_h_wrapped, pos_a_wrapped = (
        wrapped_positions[h_indices],
        wrapped_positions[a_indices],
    )

    true_vectors = (
        atoms.positions[a_indices]
        + np.dot(S_vectors, cell)
        - atoms.positions[h_indices]
    )
    phys_dist = np.linalg.norm(true_vectors, axis=1)
    vis_dist = np.linalg.norm(pos_a_wrapped - pos_h_wrapped, axis=1)

    internal_mask = vis_dist < phys_dist * 1.5
    pbc_mask = ~internal_mask

    for i in np.where(internal_mask)[0]:
        wrapped_geometries.append(
            (pos_h_wrapped[i].tolist(), pos_a_wrapped[i].tolist())
        )

    if np.any(pbc_mask):
        starts_h, dirs_h = pos_h_wrapped[pbc_mask], true_vectors[pbc_mask]
        starts_a, dirs_a = pos_a_wrapped[pbc_mask], -true_vectors[pbc_mask]

        intersections_h = _get_cell_intersections_vectorized(
            starts_h, dirs_h, np.array(cell)
        )
        intersections_a = _get_cell_intersections_vectorized(
            starts_a, dirs_a, np.array(cell)
        )

        for i in range(len(intersections_h)):
            wrapped_geometries.append(
                (starts_h[i].tolist(), intersections_h[i].tolist())
            )
            wrapped_geometries.append(
                (starts_a[i].tolist(), intersections_a[i].tolist())
            )

    unwrapped_geometries = [
        (atoms.positions[h].tolist(), (atoms.positions[a] + np.dot(S, cell)).tolist())
        for h, a, S in h_bonds_info
    ]

    return wrapped_geometries, unwrapped_geometries


def has_covalent_periodicity(atoms: Atoms, bonds: List[Any]) -> bool:
    """
    Check if a set of bonds exhibits covalent periodicity (crossing unit cell boundaries).
    """
    if not atoms.pbc.any():
        return False

    for bond in bonds:
        # Bonds are expected to be (u, v, offset) or (u, v, order, offset)
        if len(bond) >= 3:
            # offset is usually the last element if length is 3 or 4
            offset = bond[2] if len(bond) == 3 else bond[3]
            if any(o != 0 for o in offset):
                return True
    return False


# --- NEW INFERENCE LOGIC ---


def get_clusters(atoms: Atoms, bonds: List[Tuple[int, int]]) -> Tuple[int, np.ndarray]:
    """
    Split atoms into connected components (clusters).
    Returns (n_components, labels) where labels[i] is the cluster index for atom i.
    """
    n_atoms = len(atoms)
    if n_atoms == 0:
        return 0, np.array([])

    # Build adjacency matrix
    row_ind = [b[0] for b in bonds]
    col_ind = [b[1] for b in bonds]
    # Symmetrize
    rows = row_ind + col_ind
    cols = col_ind + row_ind
    data = [1] * len(rows)

    adj_matrix = scipy.sparse.csr_matrix((data, (rows, cols)), shape=(n_atoms, n_atoms))

    n_components, labels = scipy.sparse.csgraph.connected_components(
        csgraph=adj_matrix, directed=False, return_labels=True
    )
    return n_components, labels


def classify_sp2_subgraphs(
    atoms: Atoms, sp2_indices: List[int], bonds: List[Tuple[int, int]]
) -> Tuple[Set[int], Set[int]]:
    """
    Classify sp2 hybridized subgraphs as 'infinite' (periodic) or 'finite' (isolated).
    """
    sp2_set = set(sp2_indices)
    if not sp2_set:
        return set(), set()

    sp2_bonds = []
    has_offsets = False
    if bonds and len(bonds[0]) >= 3:
        has_offsets = True

    for bond in bonds:
        u, v = bond[0], bond[1]
        if u in sp2_set and v in sp2_set:
            sp2_bonds.append(bond)

    n_atoms = len(atoms)
    if n_atoms == 0:
        return set(), set()

    row_ind = [b[0] for b in sp2_bonds]
    col_ind = [b[1] for b in sp2_bonds]

    rows = row_ind + col_ind
    cols = col_ind + row_ind
    data = [1] * len(rows)

    adj_matrix = scipy.sparse.csr_matrix((data, (rows, cols)), shape=(n_atoms, n_atoms))

    _, labels = scipy.sparse.csgraph.connected_components(
        csgraph=adj_matrix, directed=False, return_labels=True
    )

    infinite_indices = set()
    finite_indices = set()
    infinite_labels = set()

    if atoms.pbc.any():
        cell = atoms.get_cell()
        pbc = atoms.pbc
        positions = atoms.positions

        for bond in sp2_bonds:
            u, v = bond[0], bond[1]
            l = labels[u]
            if l in infinite_labels:
                continue

            is_periodic = False
            if has_offsets:
                offset = bond[2]
                if np.any(np.array(offset) != 0):
                    is_periodic = True
            else:
                vec = positions[v] - positions[u]
                vec_mic, _ = find_mic(vec, cell, cast(Any, pbc))
                if np.linalg.norm(vec - vec_mic) > 1e-4:
                    is_periodic = True

            if is_periodic:
                infinite_labels.add(l)

    for idx in sp2_indices:
        if labels[idx] in infinite_labels:
            infinite_indices.add(idx)
        else:
            finite_indices.add(idx)

    return infinite_indices, finite_indices


def is_sp2_system(
    atoms: Atoms, bonds: List[Any], indices: Optional[np.ndarray] = None
) -> bool:
    """
    Check if a cluster or system looks like an sp2 network (Graphene, h-BN, C3N4, etc).
    """
    if indices is None:
        indices = np.arange(len(atoms))

    if len(indices) < 3:
        return False

    symbols = np.array(atoms.get_chemical_symbols())
    sp2_elements = {"C", "N", "B"}

    idx_list = indices.tolist() if isinstance(indices, np.ndarray) else indices
    sp2_indices_set = {int(idx) for idx in idx_list if symbols[idx] in sp2_elements}

    if len(sp2_indices_set) < 3:
        return False

    if len(sp2_indices_set) / len(idx_list) < 0.4:
        return False

    coordination = {idx: 0 for idx in sp2_indices_set}
    for b in bonds:
        u, v = int(b[0]), int(b[1])
        if u in sp2_indices_set and v in sp2_indices_set:
            coordination[u] += 1
            coordination[v] += 1

    count_valid = 0
    for idx in sp2_indices_set:
        if 2 <= coordination[idx] <= 4:
            count_valid += 1

    # If most of the sp2 atoms have sp2-like coordination
    ratio = count_valid / len(sp2_indices_set)

    # Bypass coordination check for pure sp2 clusters (like small periodic cells)
    if len(sp2_indices_set) == len(idx_list):
        return True

    return ratio > 0.6


def determine_strategy(atoms: Atoms, cluster_indices: List[int]) -> str:
    """
    Determine processing strategy for a cluster based on its composition.
    """
    symbols = [atoms[i].symbol for i in cluster_indices]
    unique_symbols = set(symbols)

    has_tm = any(is_transition_metal(s) for s in unique_symbols)
    has_f_block = any(is_lanthanide_actinide(s) for s in unique_symbols)
    has_alkali = any(is_alkali_alkaline(s) for s in unique_symbols)
    has_boron = "B" in unique_symbols

    if has_f_block:
        return "ionic"
    if has_tm:
        return "metal_complex"
    if has_alkali:
        return "ionic"
    if has_boron:
        return "borane" if len(cluster_indices) > 2 else "full"
    return "full"


def is_sp2_system_simple(atoms: Atoms, bonds: List[Any], indices: List[int]) -> bool:
    """
    Simpler check for SP2 system based on elements and coordination.
    """
    symbols = np.array(atoms.get_chemical_symbols())
    sp2_elements = {"C", "N", "B"}

    cluster_sp2_indices = [i for i in indices if symbols[i] in sp2_elements]
    if not cluster_sp2_indices:
        return False

    if len(cluster_sp2_indices) / len(indices) < 0.4:
        return False

    # Coordination check
    coordination = {i: 0 for i in cluster_sp2_indices}
    for b in bonds:
        u, v = int(b[0]), int(b[1])
        if u in coordination:
            coordination[u] += 1
        if v in coordination:
            coordination[v] += 1

    count_valid = 0
    for i in cluster_sp2_indices:
        # sp2 atoms have 2 or 3 neighbors. In small cells, they might have more images.
        if 2 <= coordination[i] <= 6:
            count_valid += 1

    # Very small clusters of pure SP2 are always considered SP2 networks
    if len(indices) <= 6 and len(cluster_sp2_indices) == len(indices):
        return True

    return count_valid / len(cluster_sp2_indices) > 0.6


def _record_bond_diagnostics(
    diagnostics: Optional[Dict[str, Any]], *, strategy: str, summary_key: str
) -> None:
    if diagnostics is None:
        return

    cluster_strategies = diagnostics.setdefault("cluster_strategies", [])
    if isinstance(cluster_strategies, list):
        cluster_strategies.append(strategy)

    summary = diagnostics.setdefault("summary", {})
    if isinstance(summary, dict):
        summary[summary_key] = int(summary.get(summary_key, 0)) + 1


def _is_aromatic_ring(atoms, ring, arom_detector, planarity_tol: float = 0.1) -> bool:
    """
    Decide whether a candidate ring is aromatic, for the heuristic fallback path
    (RDKit unavailable). Uses the textbook aromaticity criterion that survives an
    imperfect Kekulé: the ring must be (near-)planar AND every ring atom must be
    sp2 / contribute a p-orbital to a continuous pi system:

    - C / N / B: must be sp2 (planar, low coordination) — ``is_sp2_atom``.
    - O / S:     a 2-coordinate lone-pair donor (furan O, thiophene S).

    A bond-order count is deliberately avoided here: the Kekulé fallback often
    under-kekulizes benzene (2 inferred double bonds instead of 3), so a "count
    the double bonds" test would drop real aromatics. The sp2 test instead
    cleanly rejects the sp3 carbons of cyclohexane, cyclohexene and 1,n-dienes,
    and the planarity test rejects puckered saturated rings even when hydrogens
    are absent.
    """
    from app.services.heuristics import is_planar_ring

    if not is_planar_ring(atoms.positions, ring, tol=planarity_tol):
        return False

    symbols = atoms.get_chemical_symbols()
    for idx in ring:
        sym = symbols[idx]
        if sym in ("C", "N", "B"):
            if not arom_detector.is_sp2_atom(idx):
                return False
        elif sym in ("O", "S"):
            if len(arom_detector.adj[idx]) != 2:
                return False
        else:
            return False
    return True


def infer_bond_orders(
    atoms: Atoms,
    bonds: List[Any],
    bond_inference_mode: Literal["auto", "quick", "full"] = "auto",
    diagnostics: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Any], List[Tuple[List[float], List[float], float]]]:
    """
    Main entry point for bond order inference.
    """
    debug_log("--- Starting Hybrid Bond Order Inference ---")

    if diagnostics is not None:
        diagnostics["mode"] = bond_inference_mode
        diagnostics.setdefault("cluster_strategies", [])
        diagnostics.setdefault("summary", {})

    n_components, labels = get_clusters(atoms, bonds)

    final_bonds = []
    all_rings = []

    cluster_bonds_map = defaultdict(list)
    for b in bonds:
        u = b[0]
        cluster_bonds_map[labels[u]].append(b)

    for c_idx in range(n_components):
        indices = np.where(labels == c_idx)[0].tolist()
        c_bonds = cluster_bonds_map[c_idx]

        if not c_bonds:
            continue

        is_periodic = has_covalent_periodicity(atoms, c_bonds)
        if is_periodic:
            debug_log(
                f"  Cluster {c_idx} (size {len(indices)}) -> Periodic System (Kekule)."
            )
            generator = KekuleStructureGenerator(atoms, c_bonds)
            final_bonds.extend(generator.generate_kekule())
            _record_bond_diagnostics(
                diagnostics,
                strategy="periodic_kekule",
                summary_key="kekule",
            )
            continue

        # Decide strategy
        if bond_inference_mode == "quick":
            strategy = "quick"
            debug_log(f"  Cluster {c_idx} -> Forced quick mode.")
        elif bond_inference_mode == "full":
            strategy = "full"
            debug_log(f"  Cluster {c_idx} -> Forced full mode.")
        else:
            if is_sp2_system_simple(atoms, c_bonds, indices):
                debug_log(f"  Cluster {c_idx} -> Finite SP2 (RDKit).")
                strategy = "full"
            else:
                strategy = determine_strategy(atoms, indices)
                debug_log(f"  Cluster {c_idx} -> Strategy: {strategy}")

        inferred = []
        rings = []

        if strategy == "quick":
            for b in c_bonds:
                offset = b[2] if len(b) >= 3 else (0, 0, 0)
                inferred.append((b[0], b[1], 1.0, offset))
            _record_bond_diagnostics(
                diagnostics,
                strategy="quick",
                summary_key="quick",
            )
        elif strategy == "full":
            c_bonds_stripped = [b[:2] for b in c_bonds]
            rd_bonds, rd_rings = detect_bonds_rdkit(atoms, c_bonds_stripped, indices)
            if rd_bonds:
                # Map RDKit results back to include original offsets
                order_map_local = {(b[0], b[1]): b[2] for b in rd_bonds}
                for b in c_bonds:
                    u, v = b[0], b[1]
                    order = order_map_local.get((u, v), 1.0)
                    offset = b[2] if len(b) >= 3 else (0, 0, 0)
                    inferred.append((u, v, order, offset))
                rings = rd_rings
                _record_bond_diagnostics(
                    diagnostics,
                    strategy="full",
                    summary_key="rdkit",
                )
            else:
                debug_log("    RDKit failed. Trying Kekule fallback.")
                generator = KekuleStructureGenerator(atoms, c_bonds)
                inferred = generator.generate_kekule()
                used_heuristic_fallback = False

                if all(b[2] == 1.0 for b in inferred):
                    debug_log(
                        "    Kekule returned only single bonds. Using heuristics."
                    )
                    propagator = ValencePropagator(atoms, c_bonds)
                    inferred = propagator.infer()
                    used_heuristic_fallback = True

                # Fallback aromatic ring detection
                from app.services.heuristics import (
                    EnhancedAromaticityDetector,
                    SpecialStructureDetector,
                )

                sd = SpecialStructureDetector(atoms, c_bonds)
                basis_rings = sd.detect_small_rings(max_size=6)
                # Geometric sp2 detector used to qualify each candidate ring;
                # rings are only marked aromatic when planar and fully sp2.
                arom_detector = EnhancedAromaticityDetector(atoms, c_bonds)
                for ring in basis_rings:
                    if len(ring) in [5, 6]:
                        if all(atoms.symbols[i] in ["C", "N", "O", "S"] for i in ring):
                            if not _is_aromatic_ring(atoms, ring, arom_detector):
                                continue
                            ring_pos = atoms.positions[ring]
                            center = np.mean(ring_pos, axis=0)
                            v1 = ring_pos[1] - ring_pos[0]
                            v2 = ring_pos[2] - ring_pos[0]
                            normal = np.cross(v1, v2)
                            norm = np.linalg.norm(normal)
                            if norm > 1e-6:
                                rings.append(
                                    (
                                        center.tolist(),
                                        (normal / norm).tolist(),
                                        float(
                                            np.mean(
                                                np.linalg.norm(
                                                    ring_pos - center, axis=1
                                                )
                                            )
                                        )
                                        * 0.8,
                                    )
                                )
                _record_bond_diagnostics(
                    diagnostics,
                    strategy="full",
                    summary_key="heuristic" if used_heuristic_fallback else "kekule",
                )

        elif strategy in ["borane", "metal_complex", "ionic"]:
            propagator = ValencePropagator(atoms, c_bonds)
            inferred = propagator.infer()
            _record_bond_diagnostics(
                diagnostics,
                strategy=strategy,
                summary_key="heuristic",
            )
        else:
            for b in c_bonds:
                offset = b[2] if len(b) >= 3 else (0, 0, 0)
                inferred.append((b[0], b[1], 1.0, offset))
            _record_bond_diagnostics(
                diagnostics,
                strategy=strategy,
                summary_key="heuristic",
            )

        final_bonds.extend(inferred)
        all_rings.extend(rings)

    return final_bonds, all_rings


def _filter_hydrogen_bonds(atoms: Atoms, bonds: List[Any]) -> List[Any]:
    """
    Groups bonds by Hydrogen atom index.
    For each H with > 1 bond:
      - If any neighbor is a Metal -> KEEP ALL.
      - If all neighbors are Non-Metals -> KEEP ONLY SHORTEST.
    """
    symbols = atoms.get_chemical_symbols()
    positions = atoms.positions
    cell = atoms.cell
    pbc = atoms.pbc

    # Group bonds by atom index
    atom_bond_indices = defaultdict(list)
    for i, b in enumerate(bonds):
        u, v = b[0], b[1]
        atom_bond_indices[u].append(i)
        atom_bond_indices[v].append(i)

    h_indices = [i for i, s in enumerate(symbols) if s == "H"]
    to_remove = set()

    for h_idx in h_indices:
        b_indices = atom_bond_indices[h_idx]
        if len(b_indices) <= 1:
            continue

        # H has multiple bonds
        neighbor_info = []  # List of (neighbor_idx, distance, bond_index)
        for b_idx in b_indices:
            bond = bonds[b_idx]
            u, v = bond[0], bond[1]
            neighbor_idx = v if u == h_idx else u

            # Distance calculation
            if len(bond) == 4 and bond[3] is not None:
                offset = np.array(bond[3])
                if u == h_idx:
                    vec = positions[v] + np.dot(offset, cell) - positions[u]
                else:
                    vec = positions[u] - (positions[v] + np.dot(offset, cell))
                dist = np.linalg.norm(vec)
            else:
                # Use MIC distance
                vec = positions[neighbor_idx] - positions[h_idx]
                if pbc.any():
                    vec, _ = find_mic(vec, cell, cast(Any, pbc))
                dist = np.linalg.norm(vec)

            neighbor_info.append((neighbor_idx, dist, b_idx))

        # Check if any neighbor is metal
        has_metal = any(is_metal(symbols[item[0]]) for item in neighbor_info)

        if not has_metal:
            # Keep only the shortest
            neighbor_info.sort(key=lambda x: x[1])
            for item in neighbor_info[1:]:  # All but the shortest
                to_remove.add(item[2])

    return [b for i, b in enumerate(bonds) if i not in to_remove]


def _has_wrapped_visual_mismatch(true_vec: np.ndarray, wrapped_vec: np.ndarray) -> bool:
    true_dist = float(np.linalg.norm(true_vec))
    if true_dist < 1e-8:
        return False

    wrapped_dist = float(np.linalg.norm(wrapped_vec))
    if wrapped_dist < 1e-8:
        return False

    return wrapped_dist > true_dist * 1.8 and (wrapped_dist - true_dist) > 0.75


# --- MAIN GEOMETRY FUNCTION ---


def get_structure_topology(
    atoms: Atoms,
    bond_scale: float = 1.2,
    bond_overrides: Optional[Dict[str, str]] = None,
) -> Set[Tuple[int, int, Tuple[int, int, int]]]:
    """
    Get the topology of the structure (connected pairs).
    Returns a set of (u, v, offset) tuples.
    Handles natural neighbors and bond overrides (additions/deletions).
    """
    if bond_overrides is None:
        bond_overrides = {}

    # 1. Calculate Natural Neighbors
    # Use natural_cutoffs with bond_scale
    cutoffs = natural_cutoffs(atoms, mult=cast(Any, bond_scale))

    all_bonds_set = set()

    if atoms.pbc.any():
        nl = NeighborList(cutoffs, 0.3, False, False, True)
        nl.update(atoms)
        for i in range(len(atoms)):
            indices, offsets = nl.get_neighbors(i)
            for j, offset in zip(indices, offsets):
                offset_tuple = tuple(offset)
                # Ensure canonical representation for the set
                if i < j:
                    all_bonds_set.add((i, j, offset_tuple))
                elif i == j:
                    # Self-interaction (periodic image)
                    # Use lexicographical order of offset to avoid duplicates
                    if offset_tuple > (0, 0, 0):
                        all_bonds_set.add((i, j, offset_tuple))
    else:
        indices_i, indices_j = neighbor_list("ij", atoms, cutoffs)
        mask = indices_i < indices_j
        all_bonds_set = {
            (i, j, (0, 0, 0)) for i, j in zip(indices_i[mask], indices_j[mask])
        }

    # 2. Process Overrides
    deletions = set()
    additions = []

    for bond_id, action in bond_overrides.items():
        parts = bond_id.split("-")
        if len(parts) != 2:
            continue
        try:
            u, v = int(parts[0]), int(parts[1])
            if u == v:  # skip self-loops in overrides for now
                continue
            pair = tuple(sorted((u, v)))

            if str(action).lower() == "delete":
                deletions.add(pair)
            else:
                additions.append(pair)
        except ValueError:
            continue

    # Apply Deletions
    if deletions:
        all_bonds_set = {
            b for b in all_bonds_set if tuple(sorted((b[0], b[1]))) not in deletions
        }

    # Apply Additions
    existing_pairs = {tuple(sorted((b[0], b[1]))) for b in all_bonds_set}

    for pair in additions:
        if pair not in existing_pairs:
            all_bonds_set.add((pair[0], pair[1], (0, 0, 0)))
            existing_pairs.add(pair)

    return all_bonds_set


def get_bonds_and_ghosts(
    atoms: Atoms,
    bond_scale: float = 1.2,
    bond_overrides: Optional[Dict[str, str]] = None,
    bond_inference_mode: Literal["auto", "quick", "full"] = "auto",
    diagnostics: Optional[Dict[str, Any]] = None,
) -> Tuple[
    List[Tuple[int, int, float]],
    List[
        Tuple[Tuple[float, float, float], Tuple[float, float, float], int, int, float]
    ],
    List[Tuple[List[float], List[float], float]],
]:
    debug_log(f"\n--- Starting get_bonds_and_ghosts with scale {bond_scale} ---")
    if bond_overrides is None:
        bond_overrides = {}

    if diagnostics is not None:
        diagnostics["mode"] = bond_inference_mode
        diagnostics.setdefault("cluster_strategies", [])
        diagnostics.setdefault("summary", {})

    # 1. Get Topology (Connectivity)
    all_bonds_set = get_structure_topology(atoms, bond_scale, bond_overrides)

    if not all_bonds_set:
        return [], [], []

    positions = atoms.positions
    cell = np.array(atoms.get_cell())
    connectivity_bonds = list(all_bonds_set)

    # 2. Infer Bond Orders
    bonds_w_orders, aromatic_rings = infer_bond_orders(
        atoms,
        connectivity_bonds,
        bond_inference_mode=bond_inference_mode,
        diagnostics=diagnostics,
    )

    # 3. Filter Hydrogen Bonds
    bonds_w_orders = _filter_hydrogen_bonds(atoms, bonds_w_orders)

    # 4. Apply Bond Order Overrides
    overridden_bonds = []
    for b in bonds_w_orders:
        u, v = b[0], b[1]
        bond_id = f"{min(u, v)}-{max(u, v)}"
        action = bond_overrides.get(bond_id)

        if str(action).lower() == "delete":
            continue

        if action is not None:
            try:
                new_order = float(action)
                new_b = list(b)
                new_b[2] = new_order
                overridden_bonds.append(tuple(new_b))
            except ValueError:
                overridden_bonds.append(b)
        else:
            overridden_bonds.append(b)
    bonds_w_orders = overridden_bonds

    # 5. Construct Result (Regular + Ghost Bonds)
    regular_bonds = []
    ghost_bonds_data = []  # List of (u, v, order, true_vec)

    wrapped_positions = atoms.get_positions(wrap=True)
    image_translations = None
    if atoms.pbc.any():
        scaled_positions_raw = np.asarray(
            atoms.get_scaled_positions(wrap=False), dtype=float
        )
        scaled_positions_wrapped = np.asarray(
            atoms.get_scaled_positions(wrap=True), dtype=float
        )
        image_translations = np.rint(
            scaled_positions_raw - scaled_positions_wrapped
        ).astype(int)

    for b in bonds_w_orders:
        u, v, order = int(b[0]), int(b[1]), float(b[2])
        if u == v:
            continue
        offset = np.array(b[3]) if len(b) >= 4 else np.zeros(3, dtype=int)

        # A bond is regular if it doesn't cross the boundary (offset is zero)
        if np.all(offset == 0):
            if atoms.pbc.any():
                true_vec = positions[v] - positions[u]
                wrapped_vec = wrapped_positions[v] - wrapped_positions[u]
                if _has_wrapped_visual_mismatch(true_vec, wrapped_vec):
                    ghost_bonds_data.append((u, v, order, true_vec))
                    continue
            regular_bonds.append((u, v, order))
        else:
            canonical_offset = offset
            if image_translations is not None:
                canonical_offset = (
                    image_translations[v] + offset - image_translations[u]
                ).astype(int)

            if np.all(canonical_offset == 0):
                regular_bonds.append((u, v, order))
                continue

            if atoms.pbc.any():
                true_vec = (
                    wrapped_positions[v]
                    + np.dot(canonical_offset, cell)
                    - wrapped_positions[u]
                )
            else:
                true_vec = positions[v] + np.dot(canonical_offset, cell) - positions[u]
            ghost_bonds_data.append((u, v, order, true_vec))

    if regular_bonds and ghost_bonds_data:
        ghost_min_distance_by_pair: dict[tuple[int, int], float] = {}
        for ghost_u, ghost_v, _ghost_order, ghost_vec in ghost_bonds_data:
            ghost_u_idx = int(ghost_u)
            ghost_v_idx = int(ghost_v)
            pair = (
                (ghost_u_idx, ghost_v_idx)
                if ghost_u_idx < ghost_v_idx
                else (ghost_v_idx, ghost_u_idx)
            )
            ghost_distance = float(np.linalg.norm(ghost_vec))
            current_min = ghost_min_distance_by_pair.get(pair)
            if current_min is None or ghost_distance < current_min:
                ghost_min_distance_by_pair[pair] = ghost_distance

        filtered_regular_bonds: list[tuple[int, int, float]] = []
        for regular_u, regular_v, regular_order in regular_bonds:
            regular_u_idx = int(regular_u)
            regular_v_idx = int(regular_v)
            pair = (
                (regular_u_idx, regular_v_idx)
                if regular_u_idx < regular_v_idx
                else (regular_v_idx, regular_u_idx)
            )
            ghost_distance = ghost_min_distance_by_pair.get(pair)
            if ghost_distance is None:
                filtered_regular_bonds.append((regular_u, regular_v, regular_order))
                continue

            regular_distance = float(
                np.linalg.norm(positions[int(regular_v)] - positions[int(regular_u)])
            )
            if (
                regular_distance > ghost_distance * 1.2
                and (regular_distance - ghost_distance) > 0.1
            ):
                continue

            filtered_regular_bonds.append((regular_u, regular_v, regular_order))

        regular_bonds = filtered_regular_bonds

    wrapped_ghost_bonds = []
    if ghost_bonds_data:
        u_indices = np.array([item[0] for item in ghost_bonds_data])
        v_indices = np.array([item[1] for item in ghost_bonds_data])
        orders = [item[2] for item in ghost_bonds_data]
        true_vecs = np.array([item[3] for item in ghost_bonds_data])

        starts_u = wrapped_positions[u_indices]
        starts_v = wrapped_positions[v_indices]

        inters_u = _get_cell_intersections_vectorized(starts_u, true_vecs, cell)
        inters_v = _get_cell_intersections_vectorized(starts_v, -true_vecs, cell)

        has_vectorized_intersections = len(inters_u) == len(ghost_bonds_data) and len(
            inters_v
        ) == len(ghost_bonds_data)
        max_reasonable_segment_length = max(
            float(np.sum(np.linalg.norm(cell, axis=1))) * 1.5,
            0.5,
        )

        for k in range(len(ghost_bonds_data)):
            u_k, v_k, order_k = u_indices[k], v_indices[k], orders[k]
            if int(u_k) == int(v_k):
                continue

            vec = true_vecs[k]
            vec_norm = float(np.linalg.norm(vec))
            if vec_norm < 1e-8:
                continue

            direction = vec / vec_norm
            segment_len = min(0.5, vec_norm * 0.5)
            fallback_u_end = starts_u[k] + direction * segment_len
            fallback_v_end = starts_v[k] - direction * segment_len

            candidate_u_end = fallback_u_end
            candidate_v_end = fallback_v_end

            if has_vectorized_intersections:
                vectorized_u_end = inters_u[k]
                vectorized_v_end = inters_v[k]
                segment_u_len = float(np.linalg.norm(vectorized_u_end - starts_u[k]))
                segment_v_len = float(np.linalg.norm(vectorized_v_end - starts_v[k]))

                vectorized_u_valid = (
                    np.all(np.isfinite(vectorized_u_end))
                    and (segment_u_len > 1e-8)
                    and (segment_u_len <= max_reasonable_segment_length)
                )
                vectorized_v_valid = (
                    np.all(np.isfinite(vectorized_v_end))
                    and (segment_v_len > 1e-8)
                    and (segment_v_len <= max_reasonable_segment_length)
                )

                if vectorized_u_valid:
                    candidate_u_end = vectorized_u_end
                if vectorized_v_valid:
                    candidate_v_end = vectorized_v_end

            candidate_u_len = float(np.linalg.norm(candidate_u_end - starts_u[k]))
            candidate_v_len = float(np.linalg.norm(candidate_v_end - starts_v[k]))

            if candidate_u_len > 1e-8:
                wrapped_ghost_bonds.append(
                    (
                        tuple(starts_u[k].tolist()),
                        tuple(candidate_u_end.tolist()),
                        int(u_k),
                        int(v_k),
                        order_k,
                    )
                )
            if candidate_v_len > 1e-8:
                wrapped_ghost_bonds.append(
                    (
                        tuple(starts_v[k].tolist()),
                        tuple(candidate_v_end.tolist()),
                        int(v_k),
                        int(u_k),
                        order_k,
                    )
                )

    debug_log(f"Generated {len(wrapped_ghost_bonds)} ghost bond segments.")
    debug_log("--- Finished get_bonds_and_ghosts ---\n")
    return regular_bonds, wrapped_ghost_bonds, aromatic_rings
