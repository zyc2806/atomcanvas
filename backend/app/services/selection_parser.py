import operator
import re
from typing import Any, cast, Optional, Dict
from collections import deque
import numpy as np
from ase import Atoms
from ase.neighborlist import natural_cutoffs, neighbor_list
from ase.geometry import find_mic
from ase.constraints import FixAtoms
from sklearn.cluster import KMeans
import pyparsing as pp

# --- Logic Functions ---

def select_by_element(atoms: Atoms, symbol: str) -> set[int]:
    """Select atoms by chemical symbol (case-insensitive match)."""
    target = symbol.capitalize()
    return {i for i, atom in enumerate(atoms) if atom.symbol == target}

def select_by_label(atoms: Atoms, label_str: str) -> set[int]:
    """Select atoms by label (e.g., C1, H2, C1-5)."""
    indices = set()

    # Pre-compute symbol map: symbol -> list of indices
    symbol_map = {}
    for i, atom in enumerate(atoms):
        sym = atom.symbol
        if sym not in symbol_map:
            symbol_map[sym] = []
        symbol_map[sym].append(i)

    # Regex to parse label: Symbol, Start, End (optional).
    # fullmatch (not match) so trailing junk like "C1xyz" doesn't silently
    # parse as "C1" — callers reach this path through the grammar today
    # but the function is exported and may be called directly.
    match = re.fullmatch(r"([A-Za-z]+)(\d+)(?:-(\d+))?", label_str)
    if not match:
        return set()

    sym_raw, start_str, end_str = match.groups()
    sym = sym_raw.capitalize()

    if sym not in symbol_map:
        return set()

    start = int(start_str)
    end = int(end_str) if end_str else start
    if start > end:
        return set()

    atom_indices = symbol_map[sym]

    # 1-based indexing check
    for k in range(start, end + 1):
        if 1 <= k <= len(atom_indices):
            indices.add(atom_indices[k - 1])

    return indices

def select_by_position(atoms: Atoms, axis: str, op_str: str, val: float, use_fractional: bool = False) -> set[int]:
    """Select atoms by Cartesian or Fractional position."""
    if use_fractional:
        coords = atoms.get_scaled_positions()
        axis_map = {'a': 0, 'b': 1, 'c': 2}
    else:
        coords = atoms.get_positions()
        axis_map = {'x': 0, 'y': 1, 'z': 2}
        
    idx = axis_map.get(axis.lower())
    if idx is None:
        raise ValueError(f"Invalid axis: {axis}")
        
    op_map = {
        '>': operator.gt, '<': operator.lt,
        '>=': operator.ge, '<=': operator.le,
        '==': operator.eq, '=': operator.eq,
        '!=': operator.ne
    }
    
    op = op_map.get(op_str)
    if not op:
        raise ValueError(f"Invalid operator: {op_str}")
        
    indices = set()
    for i, pos in enumerate(coords):
        if op(pos[idx], val):
            indices.add(i)
            
    return indices

def select_by_slab(atoms: Atoms, axis_char: str, n_clusters: int, layer_idx: int) -> set[int]:
    """
    Select atoms by slab layer using K-Means clustering.
    axis_char: x, y, z
    n_clusters: number of layers
    layer_idx: 1-based index of the layer (1 = bottom/lowest coord)
    """
    if len(atoms) < n_clusters:
         # Fallback or empty? raise error to inform user
         raise ValueError(f"Not enough atoms ({len(atoms)}) for {n_clusters} clusters.")
         
    axis_map = {'x': 0, 'y': 1, 'z': 2}
    axis = axis_map.get(axis_char.lower())
    if axis is None:
        raise ValueError(f"Invalid axis: {axis_char}")
        
    positions = atoms.get_positions()
    coords = positions[:, axis].reshape(-1, 1)
    
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init='auto')
    labels = kmeans.fit_predict(coords)
    centers = kmeans.cluster_centers_.flatten()
    
    # Sort clusters by center coordinate
    sorted_cluster_indices = np.argsort(centers)
    
    # Map sorted rank to original cluster label
    # We want the layer at rank (layer_idx - 1)
    target_rank = layer_idx - 1
    
    if not (0 <= target_rank < n_clusters):
         return set() # Index out of bounds
         
    target_cluster_label = sorted_cluster_indices[target_rank]
    
    indices = {i for i, label in enumerate(labels) if label == target_cluster_label}
    return indices

def select_by_sphere(atoms: Atoms, center: Any, radius: float) -> set[int]:
    positions = atoms.get_positions()
    if isinstance(center, int):
        if center < 0 or center >= len(atoms):
            return set()
        center_pos = positions[center]
    else:
        center_pos = np.array(center)
    
    diffs = positions - center_pos
    
    if any(atoms.pbc):
        _, dists = find_mic(diffs, atoms.cell, cast(Any, atoms.pbc))
    else:
        dists = np.linalg.norm(diffs, axis=1)
    
    return {i for i, d in enumerate(dists) if d <= radius}

from app.services.geometry import get_structure_topology

def select_by_bonded(atoms: Atoms, target_indices: list[int], bond_scale: float = 1.2, bond_overrides: Optional[Dict] = None) -> set[int]:
    if not target_indices:
        return set()
    
    try:
        # Use centralized topology logic which handles scale and overrides
        topology = get_structure_topology(atoms, bond_scale=bond_scale, bond_overrides=bond_overrides)
    except Exception as e:
        raise ValueError(f"Failed to compute topology: {e}")
    
    indices = set()
    target_set = set(target_indices)
    
    for u, v, _ in topology:
        if u in target_set:
            indices.add(v)
        if v in target_set:
            indices.add(u)
            
    return indices

def select_by_percentile(atoms: Atoms, axis: str, min_pct: float, max_pct: float) -> set[int]:
    axis_map = {'x': 0, 'y': 1, 'z': 2}
    idx = axis_map.get(axis.lower())
    if idx is None:
        raise ValueError(f"Invalid axis: {axis}")
    
    coords = atoms.get_positions()[:, idx]
    if len(coords) == 0:
        return set()
    
    low = np.percentile(coords, min_pct)
    high = np.percentile(coords, max_pct)
    
    return {i for i, val in enumerate(coords) if low <= val <= high}

def select_by_extend(atoms: Atoms, target_indices: list[int], hops: int, bond_scale: float = 1.2, bond_overrides: Optional[Dict] = None) -> set[int]:
    if not target_indices:
        return set()
    
    try:
        topology = get_structure_topology(atoms, bond_scale=bond_scale, bond_overrides=bond_overrides)
    except Exception as e:
        raise ValueError(f"Failed to compute topology: {e}")
    
    # Build adjacency map
    adj = {}
    for u, v, _ in topology:
        if u not in adj: adj[u] = []
        if v not in adj: adj[v] = []
        adj[u].append(v)
        adj[v].append(u)
    
    current_layer = set(target_indices)
    visited = set(target_indices)
    
    for _ in range(hops):
        next_layer = set()
        for i in current_layer:
            for neighbor in adj.get(i, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    next_layer.add(neighbor)
        current_layer = next_layer
        if not current_layer:
            break
            
    return visited

def select_by_connected(atoms: Atoms, target_indices: list[int], bond_scale: float = 1.2, bond_overrides: Optional[Dict] = None) -> set[int]:
    """Select all atoms in the same connected component(s) as target_indices."""
    if not target_indices:
        return set()
    
    try:
        topology = get_structure_topology(atoms, bond_scale=bond_scale, bond_overrides=bond_overrides)
    except Exception as e:
        raise ValueError(f"Failed to compute topology: {e}")
    
    # Build adjacency map
    adj = {}
    for u, v, _ in topology:
        if u not in adj: adj[u] = []
        if v not in adj: adj[v] = []
        adj[u].append(v)
        adj[v].append(u)
    
    visited = set(target_indices)
    queue = deque(target_indices)
    
    while queue:
        u = queue.popleft()
        for v in adj.get(u, []):
            if v not in visited:
                visited.add(v)
                queue.append(v)
                
    return visited

def select_fixed(atoms: Atoms) -> set[int]:
    indices = set()
    for constraint in atoms.constraints:
        if isinstance(constraint, FixAtoms):
            idx = constraint.index
            if isinstance(idx, slice):
                indices.update(range(*idx.indices(len(atoms))))
            elif isinstance(idx, np.ndarray) and idx.dtype == bool:
                indices.update(np.where(idx)[0])
            else:
                indices.update(idx)
    return indices

def select_by_id(atoms: Atoms, target_id: str) -> set[int]:
    """Select atoms by UUID stored in atoms.arrays['uuid']."""
    if 'uuid' not in atoms.arrays:
        return set()
    
    # Ensure uuids are strings
    uuids = atoms.arrays['uuid']
    indices = set()
    for i, uid in enumerate(uuids):
        if str(uid) == target_id:
            indices.add(i)
    return indices


# --- Grammar Definition ---

# Basic types
number = pp.common.number
identifier = pp.Word(pp.alphas, pp.alphanums)

# Operators
comp_op = pp.oneOf("> < >= <= == != =")

# Parsers for specific criteria
# elem:C
elem_expr = pp.Group(pp.CaselessLiteral("elem:") + identifier("symbol"))

# label:C1 or label:C1-5 or label:C1,O1
label_item = pp.Combine(pp.Word(pp.alphas) + pp.Word(pp.nums) + pp.Optional("-" + pp.Word(pp.nums)))
label_val = pp.delimitedList(label_item, delim=',')
label_expr = pp.Group(pp.CaselessLiteral("label:") + label_val)

# pos:x>5
pos_expr = pp.Group(pp.CaselessLiteral("pos:") + pp.oneOf("x y z X Y Z")("axis") + comp_op("op") + number("val"))

# frac:a<0.5
frac_expr = pp.Group(pp.CaselessLiteral("frac:") + pp.oneOf("a b c A B C")("axis") + comp_op("op") + number("val"))

# slab:z,3,1
slab_expr = pp.Group(
    pp.CaselessLiteral("slab:") + 
    pp.oneOf("x y z X Y Z")("axis") + 
    pp.Literal(",") + 
    pp.common.integer("n_clusters") + 
    pp.Literal(",") + 
    pp.common.integer("layer_index")
)

# * (all atoms)
star_expr = pp.Literal("*")

sphere_center_coord = pp.Group(number + pp.Suppress(",") + number + pp.Suppress(",") + number)
sphere_center_idx = pp.Combine(pp.Suppress("@") + pp.Word(pp.nums)).setParseAction(lambda t: int(str(t[0])))
sphere_expr = pp.Group(
    pp.CaselessLiteral("sphere:") + 
    (sphere_center_coord("coord") | sphere_center_idx("idx")) + 
    pp.Suppress(",") + 
    number("radius")
)

target_indices = pp.delimitedList(pp.Combine(pp.Suppress("@") + pp.Word(pp.nums)).setParseAction(lambda t: int(str(t[0]))), delim=',')
bonded_expr = pp.Group(pp.CaselessLiteral("bonded:") + target_indices("targets"))
connected_expr = pp.Group(pp.CaselessLiteral("connected:") + target_indices("targets"))

pct_expr = pp.Group(
    pp.CaselessLiteral("pct:") + 
    pp.oneOf("x y z X Y Z")("axis") + 
    pp.Suppress(",") + 
    number("min") + 
    pp.Suppress(",") + 
    number("max")
)

extend_expr = pp.Group(
    pp.CaselessLiteral("extend:") + 
    target_indices("targets") + 
    pp.Suppress(";") + 
    pp.common.integer("hops")
)

fixed_expr = pp.Group(pp.CaselessLiteral("fixed"))

ids_expr = pp.Group(pp.CaselessLiteral("ids:") + pp.Optional(pp.delimitedList(pp.common.integer)("targets")))

# id:some-string or uuid:some-string
# UUIDs can contain hyphens and numbers.
id_val = pp.Word(pp.alphanums + "-_")
id_selector = pp.Group((pp.CaselessLiteral("id:") | pp.CaselessLiteral("uuid:")) + id_val("target_id"))

# Forward declaration for recursive pin expression
expr = pp.Forward()

pin_expr = pp.Group(
    pp.CaselessLiteral("pin") + 
    pp.Suppress("(") + 
    expr + 
    pp.Suppress(")")
)

# Raw operands without location info
raw_operand = star_expr | elem_expr | label_expr | pos_expr | frac_expr | slab_expr | sphere_expr | bonded_expr | connected_expr | pct_expr | extend_expr | fixed_expr | ids_expr | id_selector | pin_expr

# Wrap operand to capture source location: [start, tokens, end]
operand = pp.locatedExpr(raw_operand)

# Operators with location info
op_not = pp.locatedExpr(pp.CaselessLiteral("NOT"))
op_and = pp.locatedExpr(pp.CaselessLiteral("AND"))
op_or = pp.locatedExpr(pp.CaselessLiteral("OR"))

# Boolean logic
expr <<= pp.infixNotation(operand, [
    (op_not, 1, pp.opAssoc.RIGHT),
    (op_and, 2, pp.opAssoc.LEFT),
    (op_or, 2, pp.opAssoc.LEFT),
])

def evaluate_parse_result(atoms: Atoms, parse_res, bond_scale: float = 1.2, bond_overrides: Optional[Dict] = None):
    """Recursively evaluate the parsed expression."""
    
    # If it's a ParseResults object, get the list
    if isinstance(parse_res, pp.ParseResults):
        parse_res = parse_res.as_list()
    
    # Unwrap locatedExpr: [start, val, end]
    # We check if it matches the [int, val, int] pattern
    if len(parse_res) == 3 and isinstance(parse_res[0], int) and isinstance(parse_res[2], int):
        # Recursively evaluate the value
        return evaluate_parse_result(atoms, parse_res[1], bond_scale=bond_scale, bond_overrides=bond_overrides)

    # Base case: it's a list containing a single criteria
    # e.g. ['elem:', 'C'] or [['elem:', 'C']]
    
    # Helper to check if it's a leaf node (tuple/list of criteria)
    # The structure from infixNotation can be complex.
    # Typically: ['elem:', 'C'] or ['NOT', [...]] or [[...], 'AND', [...]]
    
    if len(parse_res) == 0:
        return set()
        
    # Unwrap single-element list if it's a nested expression
    if len(parse_res) == 1 and isinstance(parse_res[0], list):
        return evaluate_parse_result(atoms, parse_res[0], bond_scale=bond_scale, bond_overrides=bond_overrides)
        
    first = parse_res[0]
    
    # Check if it's the '*' token
    if len(parse_res) == 1 and parse_res[0] == "*":
        return set(range(len(atoms)))

    # Check if it's a specific command
    if isinstance(first, str) and first.lower() in ['elem:', 'label:', 'pos:', 'frac:', 'slab:', 'sphere:', 'bonded:', 'connected:', 'pct:', 'extend:', 'fixed', 'ids:', 'pin', 'id:', 'uuid:']:
        cmd = first.lower()
        if cmd == 'elem:':
            return select_by_element(atoms, parse_res[1])
        elif cmd == 'label:':
            # Support multiple labels separated by commas
            indices = set()
            for label in parse_res[1:]:
                indices.update(select_by_label(atoms, label))
            return indices
        elif cmd == 'pos:':
            return select_by_position(atoms, parse_res[1], parse_res[2], parse_res[3], use_fractional=False)
        elif cmd == 'frac:':
            return select_by_position(atoms, parse_res[1], parse_res[2], parse_res[3], use_fractional=True)
        elif cmd == 'slab:':
            # slab: z , 3 , 1 -> indices 1, 3, 5 in the list
            return select_by_slab(atoms, parse_res[1], parse_res[3], parse_res[5])
        elif cmd == 'sphere:':
            return select_by_sphere(atoms, parse_res[1], parse_res[2])
        elif cmd == 'bonded:':
            return select_by_bonded(atoms, parse_res[1:], bond_scale=bond_scale, bond_overrides=bond_overrides)
        elif cmd == 'connected:':
            return select_by_connected(atoms, parse_res[1:], bond_scale=bond_scale, bond_overrides=bond_overrides)
        elif cmd == 'pct:':
            return select_by_percentile(atoms, parse_res[1], parse_res[2], parse_res[3])
        elif cmd == 'extend:':
            return select_by_extend(atoms, parse_res[1:-1], parse_res[-1], bond_scale=bond_scale, bond_overrides=bond_overrides)
        elif cmd == 'fixed':
            return select_fixed(atoms)
        elif cmd == 'ids:':
            # ids:1,2,3 -> indices {1, 2, 3}
            # The structure is ['ids:', 1, 2, 3]
            indices = set()
            for idx in parse_res[1:]:
                if 0 <= idx < len(atoms):
                    indices.add(idx)
            return indices
        elif cmd == 'id:' or cmd == 'uuid:':
            return select_by_id(atoms, parse_res[1])
        elif cmd == 'pin':
            # pin(expr) -> evaluate expr
            # Structure: ['pin', inner_expr]
            # Since expr is recursive, inner_expr is a list representing the expression
            return evaluate_parse_result(atoms, parse_res[1], bond_scale=bond_scale, bond_overrides=bond_overrides)
            
    # Boolean logic
    
    # Helper to extract operator string from wrapped or unwrapped operator
    def get_op_str(item):
        if isinstance(item, list) and len(item) == 3 and isinstance(item[0], int) and isinstance(item[1], str):
            return item[1].upper()
        return str(item).upper()

    # NOT expr
    # Check if first is NOT (wrapped or unwrapped)
    op_str = get_op_str(parse_res[0])
    if op_str == 'NOT':
        subset = evaluate_parse_result(atoms, parse_res[1], bond_scale=bond_scale, bond_overrides=bond_overrides)
        all_indices = set(range(len(atoms)))
        return all_indices - subset
        
    # expr AND expr, expr OR expr
    # This handles chains: A AND B AND C
    current_set = evaluate_parse_result(atoms, parse_res[0], bond_scale=bond_scale, bond_overrides=bond_overrides)
    
    idx = 1
    while idx < len(parse_res):
        op = get_op_str(parse_res[idx])
        next_expr = parse_res[idx+1]
        next_set = evaluate_parse_result(atoms, next_expr, bond_scale=bond_scale, bond_overrides=bond_overrides)
        
        if op == 'AND':
            current_set = current_set & next_set
        elif op == 'OR':
            current_set = current_set | next_set
            
        idx += 2
        
    return current_set

def parse_selection_expression(atoms: Atoms, expression: str, bond_scale: float = 1.2, bond_overrides: Optional[Dict] = None) -> list[int]:
    """
    Parse a selection string and return matching atom indices.
    """
    if not expression or not expression.strip():
        return []
        
    try:
        parsed = expr.parseString(expression, parseAll=True)
        # parsed[0] is now likely a locatedExpr [start, val, end] or a list
        result_set = evaluate_parse_result(atoms, parsed[0], bond_scale=bond_scale, bond_overrides=bond_overrides)
        return sorted([int(i) for i in result_set])
    except pp.ParseException as e:
        raise ValueError(f"Invalid selection syntax: {e}")
    except Exception as e:
        raise ValueError(f"Selection error: {e}")


def build_ast(parse_res) -> dict[str, Any]:
    """Recursively build AST from parsed expression."""
    
    if isinstance(parse_res, pp.ParseResults):
        parse_res = parse_res.as_list()
    
    if not parse_res:
        return {}

    # Check for locatedExpr wrapper [start, val, end]
    # We assume valid locatedExpr if it matches [int, val, int]
    if len(parse_res) == 3 and isinstance(parse_res[0], int) and isinstance(parse_res[2], int):
        start, val, end = parse_res
        # Recursively build AST from the value
        node = build_ast(val)
        # Attach span
        node["span"] = [start, end]
        return node
        
    if len(parse_res) == 1 and isinstance(parse_res[0], list):
        return build_ast(parse_res[0])
        
    first = parse_res[0]
    
    if len(parse_res) == 1 and parse_res[0] == "*":
        return {"type": "selector", "kind": "all", "value": "*"}

    if isinstance(first, str) and first.lower() in ['elem:', 'label:', 'pos:', 'frac:', 'slab:', 'sphere:', 'bonded:', 'connected:', 'pct:', 'extend:', 'fixed', 'ids:', 'pin', 'id:', 'uuid:']:
        cmd = first.lower()
        if cmd == 'elem:':
            return {"type": "selector", "kind": "elem", "value": parse_res[1]}
        elif cmd == 'label:':
            return {"type": "selector", "kind": "label", "values": parse_res[1:]}
        elif cmd == 'pos:':
            return {
                "type": "selector", 
                "kind": "pos", 
                "axis": parse_res[1], 
                "op": parse_res[2], 
                "value": parse_res[3]
            }
        elif cmd == 'frac:':
            return {
                "type": "selector", 
                "kind": "frac", 
                "axis": parse_res[1], 
                "op": parse_res[2], 
                "value": parse_res[3]
            }
        elif cmd == 'slab:':
             return {
                 "type": "selector", 
                 "kind": "slab", 
                 "axis": parse_res[1], 
                 "n_clusters": parse_res[3], 
                 "layer_index": parse_res[5]
             }
        elif cmd == 'sphere:':
            sphere_data = {
                "type": "selector",
                "kind": "sphere",
                "radius": parse_res[2]
            }
            if isinstance(parse_res[1], int):
                sphere_data["targets"] = [parse_res[1]]
            else:
                sphere_data["center"] = parse_res[1]
            return sphere_data
        elif cmd == 'bonded:':
            return {
                "type": "selector",
                "kind": "bonded",
                "targets": parse_res[1:]
            }
        elif cmd == 'connected:':
            return {
                "type": "selector",
                "kind": "connected",
                "targets": parse_res[1:]
            }
        elif cmd == 'pct:':
            return {
                "type": "selector",
                "kind": "pct",
                "axis": parse_res[1],
                "min": parse_res[2],
                "max": parse_res[3]
            }
        elif cmd == 'extend:':
            return {
                "type": "selector",
                "kind": "extend",
                "targets": parse_res[1:-1],
                "hops": parse_res[-1]
            }
        elif cmd == 'fixed':
            return {
                "type": "selector",
                "kind": "fixed"
            }
        elif cmd == 'ids:':
             return {
                 "type": "selector",
                 "kind": "ids",
                 "targets": parse_res[1:]
             }
        elif cmd == 'id:' or cmd == 'uuid:':
             return {
                 "type": "selector",
                 "kind": "id",
                 "target_id": parse_res[1]
             }
        elif cmd == 'pin':
             return {
                 "type": "selector",
                 "kind": "pin",
                 "operand": build_ast(parse_res[1])
             }

    # Helper to extract operator string and span from wrapped operator
    def get_op_info(item):
        if isinstance(item, list) and len(item) == 3 and isinstance(item[0], int) and isinstance(item[1], str):
            return item[1].upper(), [item[0], item[2]]
        return str(item).upper(), None

    op_str, op_span = get_op_info(parse_res[0])
    
    if op_str == 'NOT':
        operand_node = build_ast(parse_res[1])
        start = op_span[0] if op_span else 0 # Should have span if wrapped
        end = operand_node.get("span", [0, 0])[1]
        
        return {
            "type": "logic", 
            "operator": "NOT", 
            "operand": operand_node,
            "span": [start, end]
        }
        
    current_node = build_ast(parse_res[0])
    
    idx = 1
    while idx < len(parse_res):
        op_str, op_span = get_op_info(parse_res[idx])
        next_node = build_ast(parse_res[idx+1])
        
        start = current_node.get("span", [0, 0])[0]
        end = next_node.get("span", [0, 0])[1]
        
        if (current_node.get("type") == "logic" and 
            current_node.get("operator") == op_str):
            current_node["operands"].append(next_node)
            current_node["span"] = [start, end]
        else:
            current_node = {
                "type": "logic",
                "operator": op_str,
                "operands": [current_node, next_node],
                "span": [start, end]
            }
            
        idx += 2
        
    return current_node

def get_selection_ast(expression: str) -> dict[str, Any]:
    """
    Parse a selection string and return its AST as a dictionary.
    """
    if not expression or not expression.strip():
        return {}
        
    try:
        parsed = expr.parseString(expression, parseAll=True)
        return build_ast(parsed[0])
    except pp.ParseException as e:
        raise ValueError(f"Invalid selection syntax: {e}")
    except Exception as e:
        raise ValueError(f"Selection parsing error: {e}")

