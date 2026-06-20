from typing import Any, List, Literal, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..models import StandardStructureObject
from ..services.building_ops import build_supercell_atoms
from ..services.editing_ops import translate_structure_in_atoms
from ..services.structure_utils import atoms_from_dict, atoms_to_response

router = APIRouter()


class TranslateStructureRequest(BaseModel):
    structure: dict[str, Any] = Field(
        ..., description="The structure object to translate."
    )
    translation_vector: Tuple[float, float, float] = Field(
        ..., description="The translation vector."
    )
    vector_type: Literal["cartesian", "lattice"] = Field(
        ...,
        description="Whether the vector is in Cartesian (Å) or lattice (fractional) coordinates.",
    )
    wrap: bool = Field(
        False,
        description="Whether to wrap atoms back into the simulation box after translation.",
    )


class SupercellRequest(BaseModel):
    structure: dict[str, Any] = Field(..., description="The base structure object.")
    repetitions: List[int] = Field(
        ..., description="Repetitions along a, b, and c axes (e.g., [2, 2, 1])."
    )


@router.post("/translate_structure", response_model=StandardStructureObject)
async def translate_structure(request: TranslateStructureRequest):
    """Translate the entire structure in Cartesian or lattice coordinates."""
    atoms = atoms_from_dict(request.structure)
    try:
        translated = translate_structure_in_atoms(
            atoms,
            request.translation_vector,
            request.vector_type,
            request.wrap,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return atoms_to_response(translated)


@router.post("/supercell", response_model=StandardStructureObject)
async def supercell(request: SupercellRequest):
    """Replicate the structure into an N×M×K supercell."""
    atoms = atoms_from_dict(request.structure)
    try:
        supercell = build_supercell_atoms(atoms, request.repetitions)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to create supercell: {exc}"
        ) from exc

    return atoms_to_response(supercell)
