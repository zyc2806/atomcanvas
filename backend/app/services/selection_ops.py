from __future__ import annotations

from collections.abc import Callable, Iterable
import operator
import re

import numpy as np
from ase import Atoms
from sklearn.cluster import KMeans

from ..models import DetectRingResponse
from .geometry import get_bonds_and_ghosts


def _validate_atom_indices(atoms: Atoms, indices: Iterable[int]) -> list[int]:
    atom_count = len(atoms)
    validated: list[int] = []
    for index in indices:
        if index < 0 or index >= atom_count:
            raise ValueError(
                f"Atom index {index} is out of range for {atom_count} atom(s)."
            )
        validated.append(index)
    return validated


def parse_atom_labels_in_atoms(
    atoms: Atoms, labels_str: str
) -> tuple[list[int], list[str]]:
    indices: set[int] = set()
    errors: list[str] = []

    if len(atoms) == 0:
        return [], ["No atoms loaded."]

    symbol_map: dict[str, list[int]] = {}
    for index, atom in enumerate(atoms):
        symbol_map.setdefault(atom.symbol, []).append(index)

    label_pattern = re.compile(r"([A-Z][a-z]?)(\d+)(?:-(\d+))?", re.IGNORECASE)
    labels = [label.strip() for label in labels_str.split(",") if label.strip()]

    for label in labels:
        match = label_pattern.fullmatch(label)
        if not match:
            errors.append(f"Invalid format: '{label}'")
            continue

        symbol, start_str, end_str = match.groups()
        symbol = symbol.capitalize()

        if symbol not in symbol_map:
            errors.append(f"Element '{symbol}' not in structure.")
            continue

        start_num = int(start_str)
        end_num = int(end_str) if end_str else start_num
        if start_num > end_num:
            errors.append(f"Invalid range in '{label}': start > end.")
            continue

        for number in range(start_num, end_num + 1):
            if 1 <= number <= len(symbol_map[symbol]):
                indices.add(symbol_map[symbol][number - 1])
            else:
                errors.append(f"Label '{symbol}{number}' out of bounds.")

    return sorted(indices), errors


def parse_positional_criteria_in_atoms(
    atoms: Atoms,
    criteria_str: str,
    coord_type: str,
) -> tuple[list[int], list[str]]:
    indices: set[int] = set()
    errors: list[str] = []

    if len(atoms) == 0:
        return [], ["No atoms loaded."]

    coord_type_lower = coord_type.lower()
    if coord_type_lower == "cartesian":
        coords = atoms.get_positions()
        axis_map = {"x": 0, "y": 1, "z": 2}
        valid_axes = "xyz"
    elif coord_type_lower == "fractional":
        if atoms.get_cell().volume < 1e-9:
            return [], ["Fractional coordinates require a defined crystal cell."]
        coords = atoms.get_scaled_positions()
        axis_map = {"a": 0, "b": 1, "c": 2}
        valid_axes = "abc"
    else:
        return [], [f"Unknown coordinate type: {coord_type}"]

    op_map: dict[str, Callable[[float, float], bool]] = {
        ">": operator.gt,
        "<": operator.lt,
        ">=": operator.ge,
        "<=": operator.le,
        "==": operator.eq,
        "=": operator.eq,
        "!=": operator.ne,
    }
    criteria_pattern = re.compile(
        r"([xyzabc])\s*(>=|<=|==|!=|=|>|<)\s*([-\d.]+)",
        re.IGNORECASE,
    )

    parsed_conditions: list[tuple[int, Callable[[float, float], bool], float]] = []
    for part in criteria_str.split(","):
        token = part.strip()
        if not token:
            continue

        match = criteria_pattern.fullmatch(token)
        if not match:
            errors.append(f"Invalid syntax: '{token}'")
            continue

        axis_char, op_str, value_str = match.groups()
        axis_char = axis_char.lower()
        if axis_char not in valid_axes:
            errors.append(f"Invalid axis '{axis_char}' for {coord_type} coordinates.")
            continue

        try:
            value = float(value_str)
        except ValueError:
            errors.append(f"Invalid numeric value in '{token}'")
            continue

        parsed_conditions.append((axis_map[axis_char], op_map[op_str], value))

    if not parsed_conditions and not errors:
        errors.append("No valid criteria entered.")
    if errors:
        return [], errors

    for index, position in enumerate(coords):
        if all(op(position[axis], value) for axis, op, value in parsed_conditions):
            indices.add(index)

    return sorted(indices), []


def cluster_atoms_by_position(atoms: Atoms, n_clusters: int, axis: int) -> list[int]:
    if len(atoms) == 0:
        return []
    if axis not in (0, 1, 2):
        raise ValueError("Axis must be 0, 1, or 2.")
    if n_clusters <= 0:
        raise ValueError("n_clusters must be > 0.")
    if n_clusters > len(atoms):
        raise ValueError("Too many clusters.")

    positions = atoms.get_positions()
    axis_coords = positions[:, axis].reshape(-1, 1)
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")
    labels = kmeans.fit_predict(axis_coords)
    centers = kmeans.cluster_centers_.flatten()
    sorted_indices = np.argsort(centers)
    rank_map = {
        old_label: new_rank for new_rank, old_label in enumerate(sorted_indices)
    }
    return [rank_map[int(label)] for label in labels]


def detect_ring_in_atoms(
    atoms: Atoms,
    indices: list[int],
    *,
    bond_scale: float,
    bond_overrides: dict[str, str] | None = None,
) -> DetectRingResponse:
    validated_indices = _validate_atom_indices(atoms, indices)
    unique_indices = sorted(set(validated_indices))

    if len(unique_indices) < 3:
        return DetectRingResponse(is_ring=False)

    bonds, _, _ = get_bonds_and_ghosts(
        atoms,
        bond_scale=bond_scale,
        bond_overrides=bond_overrides,
    )

    selected_index_set = set(unique_indices)
    selected_bonds: list[tuple[int, int]] = []
    for first, second, _order in bonds:
        if first in selected_index_set and second in selected_index_set:
            selected_bonds.append((first, second))

    adjacency = {index: [] for index in unique_indices}
    for first, second in selected_bonds:
        adjacency[first].append(second)
        adjacency[second].append(first)

    for index in unique_indices:
        if len(adjacency[index]) != 2:
            return DetectRingResponse(is_ring=False)

    start_node = unique_indices[0]
    visited = {start_node}
    queue = [start_node]
    while queue:
        current = queue.pop(0)
        for neighbor in adjacency[current]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    if len(visited) != len(unique_indices):
        return DetectRingResponse(is_ring=False)

    positions = atoms.get_positions(wrap=True)
    reference_position = positions[unique_indices[0]]
    cell = atoms.get_cell()
    pbc = atoms.get_pbc()

    unwrapped_positions: list[np.ndarray] = []
    for index in unique_indices:
        position = positions[index]
        if np.any(pbc):
            diff = position - reference_position
            cell_array = np.array(cell)
            fractional = np.linalg.solve(cell_array.T, diff)
            fractional -= np.round(fractional)
            position = reference_position + np.dot(fractional, cell_array)
        unwrapped_positions.append(np.asarray(position, dtype=float))

    unwrapped_array = np.array(unwrapped_positions)
    center = np.mean(unwrapped_array, axis=0)
    centered = unwrapped_array - center
    _u, _s, vh = np.linalg.svd(centered)
    normal = vh[2, :]
    normal = normal / np.linalg.norm(normal)
    radius = float(np.mean(np.linalg.norm(centered, axis=1)))

    return DetectRingResponse(
        is_ring=True,
        ring_data=(center.tolist(), normal.tolist(), radius),
    )
