from fastapi import APIRouter, HTTPException

from ..models import StandardStructureObject, DeleteBondsRequest, CreateBondRequest
from ..services.bond_override_ops import create_bond_override, delete_bond_overrides
from ..services.structure_utils import atoms_from_dict, atoms_to_response

router = APIRouter()


@router.post("/delete_bonds", response_model=StandardStructureObject)
async def delete_bonds(request: DeleteBondsRequest):
    """Delete specified bonds by applying 'delete' overrides."""
    atoms = atoms_from_dict(request.structure)

    try:
        bond_overrides = delete_bond_overrides(
            atoms,
            request.bond_ids,
            request.bond_overrides,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return atoms_to_response(
        atoms, bond_scale=request.bond_scale, bond_overrides=bond_overrides
    )


@router.post("/create_bond", response_model=StandardStructureObject)
async def create_bond(request: CreateBondRequest):
    """Create a bond by applying '1.0' override."""
    atoms = atoms_from_dict(request.structure)

    try:
        bond_overrides = create_bond_override(
            atoms,
            request.bond_id,
            request.bond_overrides,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return atoms_to_response(
        atoms, bond_scale=request.bond_scale, bond_overrides=bond_overrides
    )
