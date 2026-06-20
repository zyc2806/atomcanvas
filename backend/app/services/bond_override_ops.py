from __future__ import annotations

from ase import Atoms


def normalize_bond_id(bond_id: str, atom_count: int) -> str:
    raw = bond_id.strip()
    parts = raw.split("-")
    if len(parts) != 2:
        raise ValueError("Bond id must use '<i>-<j>' format.")

    try:
        first = int(parts[0])
        second = int(parts[1])
    except ValueError as exc:
        raise ValueError("Bond id must use integer atom indices.") from exc

    if first == second:
        raise ValueError("Bond id must connect two different atoms.")
    if first < 0 or second < 0 or first >= atom_count or second >= atom_count:
        raise ValueError(
            f"Bond id '{bond_id}' is out of range for {atom_count} atom(s)."
        )

    lower, upper = sorted((first, second))
    return f"{lower}-{upper}"


def create_bond_override(
    atoms: Atoms,
    bond_id: str,
    existing_overrides: dict[str, str] | None = None,
) -> dict[str, str]:
    overrides = dict(existing_overrides or {})
    normalized = normalize_bond_id(bond_id, len(atoms))
    overrides[normalized] = "1.0"
    return overrides


def delete_bond_overrides(
    atoms: Atoms,
    bond_ids: list[str],
    existing_overrides: dict[str, str] | None = None,
) -> dict[str, str]:
    if not bond_ids:
        raise ValueError("At least one bond id is required.")

    overrides = dict(existing_overrides or {})
    for bond_id in bond_ids:
        normalized = normalize_bond_id(bond_id, len(atoms))
        overrides[normalized] = "delete"
    return overrides
