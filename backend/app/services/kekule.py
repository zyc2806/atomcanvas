from collections import defaultdict
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from ase import Atoms
from ase.geometry import find_mic
from app.services.chem_utils import is_metal

class KekuleStructureGenerator:
    """
    Generates Kekulé structures (alternating single/double bonds) for infinite sp2 networks.
    Supports heteroatoms (C, N, B) and handles Periodic Boundary Conditions (PBC).
    """
    def __init__(self, atoms: Atoms, bonds: List[Any]):
        """
        Args:
            atoms: ASE Atoms object.
            bonds: List of (u, v, offset) tuples.
        """
        if atoms is None or not isinstance(atoms, Atoms):
            raise ValueError("Invalid atoms object. Must be an ase.Atoms instance.")
        
        if not bonds:
            raise ValueError("Bonds list cannot be empty for Kekulé structure generation.")

        num_atoms = len(atoms)
        for i, bond in enumerate(bonds):
            if not isinstance(bond, (list, tuple)) or len(bond) < 2:
                raise ValueError(f"Invalid bond format at index {i}: {bond}. Expected (u, v, ...)")
            u, v = bond[0], bond[1]
            if not (0 <= u < num_atoms) or not (0 <= v < num_atoms):
                raise ValueError(f"Bond indices out of range at index {i}: ({u}, {v}) for {num_atoms} atoms.")

        self.atoms = atoms
        
        # Filter excessive bonds (e.g. from too large cutoffs in packed cells)
        self.bonds = self._prune_excessive_bonds(bonds)
        
        self.adj = defaultdict(list)
        self.coordination = defaultdict(int)
        self._build_graph()

    def _get_max_coordination(self, symbol: str) -> int:
        """Return max coordination limit for pruning based on element type."""
        if is_metal(symbol):
            return 12
        if symbol == 'H':
            return 1
        return 4

    def _prune_excessive_bonds(self, bonds: List[Any]) -> List[Any]:
        """
        Prune bonds if coordination number exceeds element-specific limits.
        Keeps the shortest bonds per atom.
        """
        positions = self.atoms.get_positions()
        cell = self.atoms.get_cell()
        pbc = self.atoms.pbc
        symbols = self.atoms.get_chemical_symbols()
        
        bond_data = []
        for i, bond in enumerate(bonds):
            u, v = int(bond[0]), int(bond[1])
            if len(bond) >= 3:
                offset_idx = 3 if len(bond) == 4 else 2
                offset = np.array(bond[offset_idx])
                vec = positions[v] + np.dot(offset, cell) - positions[u]
            else:
                vec = positions[v] - positions[u]
                if pbc.any():
                    vec, _ = find_mic(vec, cell, pbc)
            
            dist = np.linalg.norm(vec)
            bond_data.append({'index': i, 'u': u, 'v': v, 'dist': dist, 'bond': bond})
            
        atom_bonds = defaultdict(list)
        for data in bond_data:
            atom_bonds[data['u']].append(data)
            if data['u'] != data['v']:
                atom_bonds[data['v']].append(data)
                
        to_remove = set()
        
        for idx, connected in atom_bonds.items():
            max_coord = self._get_max_coordination(symbols[idx])
            if len(connected) > max_coord:
                connected.sort(key=lambda x: x['dist'])
                for b in connected[max_coord:]:
                    to_remove.add(b['index'])
                    
        return [b for i, b in enumerate(bonds) if i not in to_remove]

    def _build_graph(self):
        """
        Construct adjacency list from bonds, including PBC edges.
        Bonds are (u, v, offset).
        Also identifies ligand bonds (metal-nonmetal) for valence decoupling.
        """
        symbols = self.atoms.get_chemical_symbols()
        self.ligand_bond_indices = set()
        self.covalent_coordination = defaultdict(int)
        
        for i, bond in enumerate(self.bonds):
            u, v = int(bond[0]), int(bond[1])
            self.adj[u].append((v, i))
            self.adj[v].append((u, i))
            
            u_is_metal = is_metal(symbols[u])
            v_is_metal = is_metal(symbols[v])
            
            is_ligand_bond = (u_is_metal and not v_is_metal) or (not u_is_metal and v_is_metal)
            
            if is_ligand_bond:
                self.ligand_bond_indices.add(i)
            
            self.coordination[u] += 1
            if u != v:
                self.coordination[v] += 1
            
            if not is_ligand_bond:
                self.covalent_coordination[u] += 1
                if u != v:
                    self.covalent_coordination[v] += 1

    def get_target_bond_order_sum(self, element: str, coordination: int) -> float:
        if element == 'C':
            return 4.0
        if element == 'N':
            # sp2 Nitrogen typically has valence 3, but can form double bonds
            # in conjugated systems. If coordination is 3 (e.g. C3N4), 
            # we allow it to reach valence 4 (N+) to support Kekulé structures.
            return 4.0 if coordination >= 3 else 3.0
        if element == 'B':
            return 3.0
        
        return float(coordination)

    def generate_kekule(self) -> List[Tuple[int, int, float, Any]]:
        """
        Generate bond orders (1.0 or 2.0) using greedy matching based on valence deficit.
        
        Valence Decoupling: Metal-ligand bonds do NOT count toward valence deficit.
        This allows N coordinated to Fe to still form double bonds with C neighbors.
        """
        symbols = self.atoms.get_chemical_symbols()
        deficits = {}
        
        for i in range(len(self.atoms)):
            cov_coord = self.covalent_coordination.get(i, 0)
            if cov_coord == 0 and self.coordination.get(i, 0) == 0:
                continue
            target = self.get_target_bond_order_sum(symbols[i], cov_coord)
            deficits[i] = max(0.0, target - cov_coord)
            
        candidates = []
        for i, bond in enumerate(self.bonds):
            if i in self.ligand_bond_indices:
                continue
            u, v = int(bond[0]), int(bond[1])
            if deficits.get(u, 0) > 0 and deficits.get(v, 0) > 0:
                priority = deficits[u] + deficits[v]
                candidates.append((u, v, i, priority))
        
        candidates.sort(key=lambda x: x[3], reverse=True)
        
        bond_orders = [1.0] * len(self.bonds)
        for u, v, idx, _ in candidates:
            if deficits[u] > 0 and deficits[v] > 0:
                bond_orders[idx] = 2.0
                deficits[u] -= 1
                deficits[v] -= 1
                
        final_bonds = []
        for i, bond in enumerate(self.bonds):
            u, v = bond[0], bond[1]
            offset = bond[2] if len(bond) > 2 else (0, 0, 0)
            final_bonds.append((u, v, bond_orders[i], offset))
            
        return final_bonds
