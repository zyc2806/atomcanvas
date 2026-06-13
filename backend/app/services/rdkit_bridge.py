import numpy as np
import logging
from typing import List, Tuple, Dict, Any, Optional
from ase import Atoms

logger = logging.getLogger(__name__)

try:
    from rdkit import Chem
    from rdkit.Chem import rdDetermineBonds
    HAS_RDKIT = True
except ImportError:
    HAS_RDKIT = False
    Chem = None
    rdDetermineBonds = None

def atoms_to_rdkit_mol(atoms: Atoms, bonds: List[Tuple[int, int]], cluster_indices: Optional[List[int]] = None) -> Tuple[Any, Dict[int, int]]:
    """
    Convert ASE Atoms and connectivity to RDKit RWMol.
    If cluster_indices is provided, only include those atoms.
    Returns (mol, map_old_to_new_indices)
    """
    if not HAS_RDKIT:
        raise ImportError("RDKit is not installed.")

    mol = Chem.RWMol()
    old_to_new = {}
    
    if cluster_indices is None:
        cluster_indices = list(range(len(atoms)))
    
    symbols = atoms.get_chemical_symbols()
    positions = atoms.get_positions()
    
    for i, idx in enumerate(cluster_indices):
        atom = Chem.Atom(symbols[idx])
        mol.AddAtom(atom)
        old_to_new[idx] = i
        
    conf = Chem.Conformer(len(cluster_indices))
    for i, idx in enumerate(cluster_indices):
        pos = positions[idx]
        conf.SetAtomPosition(i, (float(pos[0]), float(pos[1]), float(pos[2])))
    mol.AddConformer(conf)
    
    for i, j in bonds:
        if i in old_to_new and j in old_to_new:
            # Filter out self-bonds (can happen in very small periodic cells)
            if i == j:
                continue
            u, v = old_to_new[i], old_to_new[j]
            if mol.GetBondBetweenAtoms(u, v) is None:
                mol.AddBond(u, v, Chem.BondType.SINGLE)
                
    return mol, old_to_new

def detect_bonds_rdkit(atoms: Atoms, bonds: List[Tuple[int, int]], cluster_indices: Optional[List[int]] = None) -> Tuple[List[Tuple[int, int, float]], List[Tuple[List[float], List[float], float]]]:
    """
    Infer bond orders and aromatic rings using RDKit.
    """
    if not HAS_RDKIT:
        logger.warning("RDKit is not installed. Bond detection using RDKit skipped.")
        return [], []

    try:
        mol, old_to_new = atoms_to_rdkit_mol(atoms, bonds, cluster_indices)
        new_to_old = {v: k for k, v in old_to_new.items()}
        
        rdDetermineBonds.DetermineBondOrders(mol, charge=0)
        
        final_bonds = []
        for bond in mol.GetBonds():
            u = new_to_old[bond.GetBeginAtomIdx()]
            v = new_to_old[bond.GetEndAtomIdx()]
            btype = bond.GetBondTypeAsDouble()
            final_bonds.append((u, v, btype))
            
        rings = []
        ssr = Chem.GetSymmSSSR(mol)
        positions = atoms.get_positions()
        
        for ring in ssr:
            indices = [new_to_old[i] for i in ring]
            is_aromatic = True
            for i in ring:
                if not mol.GetAtomWithIdx(i).GetIsAromatic():
                    is_aromatic = False
                    break
            
            if is_aromatic:
                ring_pos = positions[indices]
                center = np.mean(ring_pos, axis=0)
                if len(indices) >= 3:
                    v1 = ring_pos[1] - ring_pos[0]
                    v2 = ring_pos[2] - ring_pos[0]
                    normal = np.cross(v1, v2)
                    norm = np.linalg.norm(normal)
                    if norm > 1e-6:
                        normal = normal / norm
                        radii = np.linalg.norm(ring_pos - center, axis=1)
                        radius = float(np.mean(radii))
                        rings.append((center.tolist(), normal.tolist(), radius * 0.8))
                        
        return final_bonds, rings
        
    except Exception:
        # Capture the full traceback so this RDKit fallback path can be
        # diagnosed when bond order inference quietly returns nothing.
        logger.exception("[RDKit Bridge] DetermineBondOrders failed")
        return [], []

