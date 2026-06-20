import numpy as np
from typing import List, Tuple, Dict, Set, Optional
from ase import Atoms
from collections import defaultdict, deque
from app.services.chem_utils import is_ligand_donor, is_metal

# Extended Valence Table (Valence Electrons / Typical Bonding Capacity)
# Format: {Symbol: [Possible Valences]} (Sorted by preference)
VALENCE_TABLE = {
    # Period 1
    'H': [1], 'He': [0],
    
    # Period 2
    'Li': [1], 'Be': [2], 'B': [3], 'C': [4, 2], 'N': [3, 4, 2], 'O': [2, 1], 'F': [1], 'Ne': [0],
    
    # Period 3 (Hypervalency allowed)
    'Na': [1], 'Mg': [2], 'Al': [3], 'Si': [4], 
    'P': [3, 5], 'S': [2, 4, 6], 'Cl': [1, 3, 5, 7], 'Ar': [0],
    
    # Period 4
    'K': [1], 'Ca': [2], 'Ga': [3], 'Ge': [4], 
    'As': [3, 5], 'Se': [2, 4, 6], 'Br': [1, 3, 5, 7], 'Kr': [0],
    
    # Others
    'I': [1, 3, 5, 7], 'Xe': [0, 2, 4, 6, 8]
}

# Bond Length Table (Symbol1, Symbol2) -> {Order: Length}
# Approximations in Angstroms
BOND_LENGTH_TABLE = {
    frozenset(['C', 'C']): {1.0: 1.54, 1.5: 1.40, 2.0: 1.34, 3.0: 1.20},
    frozenset(['C', 'N']): {1.0: 1.47, 1.5: 1.34, 2.0: 1.28, 3.0: 1.16},
    frozenset(['C', 'O']): {1.0: 1.43, 1.5: 1.28, 2.0: 1.22}, # 1.5 for carboxylate
    frozenset(['N', 'N']): {1.0: 1.45, 2.0: 1.25, 3.0: 1.10},
    frozenset(['N', 'O']): {1.0: 1.40, 1.5: 1.30, 2.0: 1.20},
    frozenset(['O', 'O']): {1.0: 1.48, 2.0: 1.21},
    frozenset(['S', 'O']): {1.0: 1.58, 2.0: 1.43}, # SO4, SO2
    frozenset(['P', 'O']): {1.0: 1.60, 2.0: 1.50}, # PO4
    frozenset(['S', 'S']): {1.0: 2.05, 2.0: 1.89},
}

# Aromatic rings are essentially flat; a saturated chair/half-chair ring
# puckers well beyond this tolerance (Å).
AROMATIC_PLANARITY_TOL = 0.1


def ring_max_plane_deviation(positions, ring) -> float:
    """Max out-of-plane distance (Å) of ring atoms from their best-fit plane."""
    pts = np.asarray(positions)[list(ring)]
    centroid = pts.mean(axis=0)
    centered = pts - centroid
    # The singular vector with the smallest singular value is the plane normal.
    _, _, vh = np.linalg.svd(centered)
    normal = vh[-1]
    return float(np.max(np.abs(centered @ normal)))


def is_planar_ring(positions, ring, tol: float = AROMATIC_PLANARITY_TOL) -> bool:
    """True when every ring atom lies within ``tol`` of the ring's mean plane."""
    if len(ring) < 3:
        return False
    return ring_max_plane_deviation(positions, ring) <= tol


class EnhancedAromaticityDetector:
    def __init__(self, atoms: Atoms, bonds: List):
        self.atoms = atoms
        self.bonds = bonds
        self.symbols = atoms.get_chemical_symbols()
        self.positions = atoms.get_positions()
        self.cell = atoms.get_cell()
        self.pbc = atoms.get_pbc()
        
        self.adj = defaultdict(list)
        for bond in bonds:
            if len(bond) == 3:
                u, v, offset = bond
            else:
                u, v = bond
                offset = (0, 0, 0)
            
            # Store (neighbor_index, offset_vector)
            # Offset is defined such that pos_v_virtual = pos_v + offset @ cell
            # Relative to u: pos_v_virtual - pos_u
            offset_arr = np.array(offset)
            self.adj[u].append((v, offset_arr))
            self.adj[v].append((u, -offset_arr))
            
    def is_sp2_atom(self, idx: int) -> bool:
        if self.symbols[idx] not in ('C', 'N', 'B'):
            return False
        neighbors_info = self.adj[idx]
        # Relaxed for various environments (saturated, small cells, fragmented)
        if not (1 <= len(neighbors_info) <= 4):
            return False
        
        # sp2 "network" atoms typically have at least 1 neighbor 
        # that can participate in the network (C, N, B).
        network_neighbor_count = 0
        for n_idx, _ in neighbors_info:
            if self.symbols[n_idx] in ('C', 'N', 'B'):
                network_neighbor_count += 1
        
        if network_neighbor_count < 1:
            return False
        
        p_c = self.positions[idx]
        vectors = []
        
        for n_idx, offset in neighbors_info:
            # Calculate vector from center to neighbor, accounting for PBC
            # Vector = (pos_n + offset * cell) - pos_c
            shift = np.dot(offset, self.cell)
            vec = (self.positions[n_idx] + shift) - p_c
            
            # Fix "Zero Vector" crash (if start == end due to bad topology or small cell)
            norm = np.linalg.norm(vec)
            if norm < 1e-4:
                return False 
                
            vectors.append(vec / norm)
            
        if len(vectors) > 3:
            return False
            
        if len(vectors) < 3:
            # Terminal atoms (1 neighbor) or bridges (2 neighbors) can still be part of a network
            return len(vectors) >= 1

        # Check planarity using sum of angles
        angles = []
        for i in range(3):
            v1 = vectors[i]
            v2 = vectors[(i+1)%3]
            dot = np.clip(np.dot(v1, v2), -1.0, 1.0)
            angles.append(np.degrees(np.arccos(dot)))
            
        angle_sum = sum(angles)
        return angle_sum > 350.0

    def detect_sp2_network(self) -> List[Tuple[int, int]]:
        """
        Detect continuous sp2 networks (e.g. Graphene, h-BN, C3N4).
        Returns list of (u, v) bonds that are part of the network.
        """
        sp2_atoms_temp = {i for i in range(len(self.atoms)) if self.is_sp2_atom(i)}
        
        sp2_atoms = set()
        for i in sp2_atoms_temp:
            sp2_neighbors = [n for n, _ in self.adj[i] if n in sp2_atoms_temp]
            if len(sp2_neighbors) >= 2:
                sp2_atoms.add(i)
                
        if not sp2_atoms:
            sd = SpecialStructureDetector(self.atoms, self.bonds)
            rings = sd.detect_small_rings(max_size=6)
            for ring in rings:
                if len(ring) == 6 and all(self.symbols[i] == 'C' for i in ring):
                    # Only treat a pure-carbon 6-ring as an sp2 network when it
                    # is actually planar. A puckered (chair) ring is saturated,
                    # not aromatic, and must not get forced 1.5 bond orders.
                    if is_planar_ring(self.positions, ring):
                        for i in ring:
                            sp2_atoms.add(i)

        network_bonds = []
        for bond in self.bonds:
            u, v = bond[:2] # Handle length 2 or 3
            if u in sp2_atoms and v in sp2_atoms:
                network_bonds.append((u, v))
                
        return network_bonds

class SpecialStructureDetector:
    def __init__(self, atoms: Atoms, bonds: List):
        self.atoms = atoms
        self.bonds = bonds
        self.symbols = atoms.get_chemical_symbols()
        self.positions = atoms.get_positions()
        
        self.adj = defaultdict(list)
        for bond in bonds:
            u, v = bond[:2]
            self.adj[u].append(v)
            self.adj[v].append(u)

    def detect_small_rings(self, max_size=4) -> List[List[int]]:
        """
        Detect strained rings (size <= max_size).
        Uses a simple DFS/BFS to find cycles.
        """
        import networkx as nx
        g = nx.Graph()
        # Only use indices for graph topology, strip offsets/orders
        g.add_edges_from([b[:2] for b in self.bonds])
        
        # Basis cycles
        try:
            cycles = nx.cycle_basis(g)
            return [c for c in cycles if len(c) <= max_size]
        except Exception:
            # cycle_basis only fails on malformed graphs; swallowing
            # KeyboardInterrupt/SystemExit here would hide Ctrl-C.
            return []

    def detect_borane_bridges(self) -> List[Tuple[int, int, int]]:
        """
        Detect B-H-B 3c-2e bonds.
        Returns list of (B1, H, B2) indices.
        """
        bridges = []
        for i, sym in enumerate(self.symbols):
            if sym == 'H':
                neighbors = self.adj[i]
                b_neighbors = [n for n in neighbors if self.symbols[n] == 'B']
                if len(b_neighbors) == 2:
                    # Check geometry
                    b1, b2 = b_neighbors
                    p_h = self.positions[i]
                    p_b1 = self.positions[b1]
                    p_b2 = self.positions[b2]
                    
                    v1 = p_b1 - p_h
                    v2 = p_b2 - p_h
                    
                    # Angle B-H-B
                    angle = np.degrees(np.arccos(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))))
                    
                    if 70 < angle < 110:
                        bridges.append((b1, i, b2))
        return bridges

    def detect_carbonyls(self) -> List[Tuple[int, int]]:
        """
        Detect C=O groups (Terminal Oxygen bonded to Carbon).
        """
        carbonyls = []
        for i, sym in enumerate(self.symbols):
            if sym == 'O' and len(self.adj[i]) == 1:
                neighbor = self.adj[i][0]
                if self.symbols[neighbor] == 'C':
                    # Length check?
                    dist = np.linalg.norm(self.positions[i] - self.positions[neighbor])
                    if 1.15 < dist < 1.35: # Typical C=O is ~1.22
                        carbonyls.append((neighbor, i)) # C, O
        return carbonyls

class ValencePropagator:
    def __init__(self, atoms: Atoms, bonds: List):
        self.atoms = atoms
        self.bonds = bonds
        self.symbols = atoms.get_chemical_symbols()
        self.positions = atoms.get_positions()
        
        # Build adjacency
        self.adj = defaultdict(list)
        for bond in bonds:
            u, v = bond[:2]
            self.adj[u].append(v)
            self.adj[v].append(u)
            
        self.coordination = {i: len(self.adj[i]) for i in range(len(atoms))}
        
        # State
        self.bond_orders: Dict[Tuple[int, int], float] = {} # Key sorted (min, max)
        self.atom_valence_used = defaultdict(float)
        self.atom_valence_target = {}
        
        # Initialize targets
        for i, sym in enumerate(self.symbols):
            pref = VALENCE_TABLE.get(sym, [0])
            self.atom_valence_target[i] = pref[0]
            if len(pref) > 1 and self.coordination[i] > pref[0]:
                for v in pref:
                    if v >= self.coordination[i]:
                        self.atom_valence_target[i] = v
                        break
        
        # Initialize detectors
        self.detector = SpecialStructureDetector(atoms, bonds)
        self.aromatic_detector = EnhancedAromaticityDetector(atoms, bonds)

    def _get_valence_cost(self, atom_idx: int, neighbor_idx: int, order: float) -> float:
        u_sym = self.symbols[atom_idx]
        v_sym = self.symbols[neighbor_idx]
        
        # Metal-Ligand Coordination (Ligand view)
        # If current atom is a Ligand Donor and neighbor is a Metal
        if is_ligand_donor(u_sym) and is_metal(v_sym):
            return 0.0
            
        # Standard Covalent
        return order

    def get_bond_key(self, u, v):
        return tuple(sorted((u, v)))

    def infer(self) -> List[Tuple[int, int, float]]:
        """
        Run the propagation algorithm.
        """
        # 0. Pre-fill with Special Detectors
        # sp2 Networks (Graphene) - Assign 1.5
        sp2_bonds = self.aromatic_detector.detect_sp2_network()
        for u, v in sp2_bonds:
            bk = self.get_bond_key(u, v)
            self.bond_orders[bk] = 1.5
            # Valence accounting?
            # C(sp2) has valence 4. 3 neighbors.
            # 1.5 * 2 + 1 (if H)? Or 1.5*3 = 4.5?
            # Resonance valence is tricky.
            # Usually each bond is 1 + 1/3 = 1.33 for graphene?
            # Or 1.5 for benzene.
            # Ideally 1.5 consumes 1.5 valence.
            self.atom_valence_used[u] += self._get_valence_cost(u, v, 1.5)
            self.atom_valence_used[v] += self._get_valence_cost(v, u, 1.5)

        # Boranes
        bridges = self.detector.detect_borane_bridges()
        for b1, h, b2 in bridges:
            self.bond_orders[self.get_bond_key(b1, h)] = 0.5
            self.bond_orders[self.get_bond_key(h, b2)] = 0.5
            self.atom_valence_used[b1] += self._get_valence_cost(b1, h, 0.5)
            self.atom_valence_used[h] += self._get_valence_cost(h, b1, 0.5)
            self.atom_valence_used[b2] += self._get_valence_cost(b2, h, 0.5)
            
        # Carbonyls
        carbonyls = self.detector.detect_carbonyls()
        for c, o in carbonyls:
            bk = self.get_bond_key(c, o)
            self.bond_orders[bk] = 2.0
            self.atom_valence_used[c] += self._get_valence_cost(c, o, 2.0)
            self.atom_valence_used[o] += self._get_valence_cost(o, c, 2.0)
            
        # 1. Identify Terminals (Coordination 1)
        queue = deque()
        processed_bonds = set()
        
        for i in range(len(self.atoms)):
            if self.coordination[i] == 1:
                queue.append(i)
                
        # 2. Propagate
        while queue:
            current = queue.popleft()
            neighbors = self.adj[current]
            
            # Check unassigned bonds around current
            unassigned_neighbors = []
            for n in neighbors:
                bk = self.get_bond_key(current, n)
                if bk not in self.bond_orders:
                    unassigned_neighbors.append(n)
            
            if not unassigned_neighbors:
                continue
            
            sym = self.symbols[current]
            target = self.atom_valence_target[current]
            used = self.atom_valence_used[current]
            remaining = target - used
            
            if len(unassigned_neighbors) == 1:
                neighbor = unassigned_neighbors[0]
                bk = self.get_bond_key(current, neighbor)
                
                length = np.linalg.norm(self.positions[current] - self.positions[neighbor])
                length_order = self._guess_order_by_length(current, neighbor, length)
                
                order = float(remaining)
                order = max(1.0, min(3.0, order))
                
                self.bond_orders[bk] = order
                self.atom_valence_used[current] += self._get_valence_cost(current, neighbor, order)
                self.atom_valence_used[neighbor] += self._get_valence_cost(neighbor, current, order)
                processed_bonds.add(bk)
                
                queue.append(neighbor)
        
        # 3. Post-process: Assign defaults to remaining unassigned
        final_bonds = []
        for bond in self.bonds:
            u, v = bond[:2]
            bk = self.get_bond_key(u, v)
            if bk in self.bond_orders:
                final_bonds.append((u, v, self.bond_orders[bk]))
            else:
                length = np.linalg.norm(self.positions[u] - self.positions[v])
                order = self._guess_order_by_length(u, v, length)
                final_bonds.append((u, v, order))
                
        return final_bonds

    def _guess_order_by_length(self, u, v, length) -> float:
        sym_u, sym_v = self.symbols[u], self.symbols[v]
        key = frozenset([sym_u, sym_v])
        
        if key in BOND_LENGTH_TABLE:
            candidates = BOND_LENGTH_TABLE[key]
            best_order = 1.0
            min_diff = float('inf')
            for order, ref_len in candidates.items():
                diff = abs(length - ref_len)
                if diff < min_diff:
                    min_diff = diff
                    best_order = order
            return best_order
            
        return 1.0
