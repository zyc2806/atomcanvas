from typing import Optional, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ase import Atoms

from ..models import DetectRingRequest, DetectRingResponse
from app.services.structure_utils import atoms_from_dict
from app.services.selection_parser import parse_selection_expression, get_selection_ast
from app.services.selection_ops import (
    cluster_atoms_by_position,
    detect_ring_in_atoms,
    parse_atom_labels_in_atoms,
    parse_positional_criteria_in_atoms,
)

router = APIRouter()


def cluster_atoms_by_position_logic(
    atoms: Atoms,
    n_clusters: int,
    axis: int,
) -> list[int]:
    return cluster_atoms_by_position(atoms, n_clusters, axis)


# --- Pydantic Models ---


class ParseExpressionRequest(BaseModel):
    structure: dict[str, object]
    expression: str
    bond_overrides: Optional[Dict[str, str]] = None
    bond_scale: Optional[float] = 1.2


class ParseASTRequest(BaseModel):
    expression: str


class ParseLabelsRequest(BaseModel):
    structure: dict[str, object]
    labels_str: str


class FilterPositionRequest(BaseModel):
    structure: dict[str, object]
    criteria_str: str
    coord_type: str


class AnalyzeClustersRequest(BaseModel):
    structure: dict[str, object]
    n_clusters: int
    axis: int


# --- API Endpoints ---


@router.post("/selection/parse_labels")
async def parse_labels(request: ParseLabelsRequest):
    """Parses an atom label string and returns a list of atom indices."""
    atoms = atoms_from_dict(request.structure)
    indices, errors = parse_atom_labels_in_atoms(atoms, request.labels_str)
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})
    return {"indices": indices}


@router.post("/selection/parse_expression")
async def parse_expression(request: ParseExpressionRequest):
    """Parses a selection expression and returns indices."""
    try:
        atoms = atoms_from_dict(request.structure)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid structure: {str(e)}")

    try:
        indices = parse_selection_expression(
            atoms,
            request.expression,
            bond_scale=request.bond_scale if request.bond_scale is not None else 1.2,
            bond_overrides=request.bond_overrides,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Selection error: {str(e)}")

    return {"indices": indices}


@router.post("/selection/parse_ast")
async def parse_ast(request: ParseASTRequest):
    """Parses a selection expression into an AST for visualization."""
    try:
        ast = get_selection_ast(request.expression)
    except ValueError as e:
        return {"ast": None, "error": str(e)}
    return {"ast": ast}


@router.post("/selection/filter_position")
async def filter_position(request: FilterPositionRequest):
    """Filters atoms based on positional criteria and returns indices."""
    atoms = atoms_from_dict(request.structure)
    indices, errors = parse_positional_criteria_in_atoms(
        atoms, request.criteria_str, request.coord_type
    )
    if errors:
        raise HTTPException(status_code=400, detail={"errors": errors})
    return {"indices": indices}


@router.post("/selection/analyze_clusters")
async def analyze_clusters(request: AnalyzeClustersRequest):
    """Performs K-Means clustering on atom positions along an axis."""
    atoms = atoms_from_dict(request.structure)
    try:
        cluster_ids = cluster_atoms_by_position(atoms, request.n_clusters, request.axis)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"cluster_ids": cluster_ids}


@router.post("/selection/detect_ring", response_model=DetectRingResponse)
async def detect_ring(request: DetectRingRequest):
    """Checks if the selected atoms form a ring."""
    atoms = atoms_from_dict(request.structure)
    try:
        return detect_ring_in_atoms(
            atoms,
            request.indices,
            bond_scale=request.bond_scale,
            bond_overrides=request.bond_overrides,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
