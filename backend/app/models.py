from pydantic import BaseModel, Field
from typing import Any, List, Tuple, Optional, Dict, Literal

BondInferenceMode = Literal["auto", "quick", "full"]


class BondDiagnostics(BaseModel):
    mode: BondInferenceMode
    cluster_strategies: List[str] = Field(default_factory=list)
    summary: Dict[str, int] = Field(default_factory=dict)


class Structure(BaseModel):
    """
    Core atomic structure information for both wrapped and unwrapped states.
    """

    symbols: List[str]
    positions: List[Tuple[float, float, float]]  # Unwrapped coordinates
    wrapped_positions: List[Tuple[float, float, float]]  # Wrapped coordinates
    cell: Optional[List[List[float]]] = None
    pbc: Optional[Tuple[bool, bool, bool]] = None
    ids: Optional[List[str]] = None


class Visualization(BaseModel):
    """
    Data used for frontend rendering, corresponding to different view modes.
    """

    bonds: List[Tuple[int, int, float]]  # (idx1, idx2, order)
    rings: Optional[
        List[Tuple[List[float], List[float], float]]
    ] = []  # (center, normal, radius)
    wrapped_ghost_bonds: List[
        Tuple[Tuple[float, float, float], Tuple[float, float, float], int, int, float]
    ]
    h_bond_geometries: List[Tuple[List[float], List[float]]]  # Wrapped (含 Ghost)
    unwrapped_h_bonds: List[Tuple[List[float], List[float]]]  # Unwrapped (直连)
    labels: Optional[List[str]] = None
    fixed_atoms: Optional[List[int]] = None
    bond_diagnostics: Optional[BondDiagnostics] = None


class StandardStructureObject(BaseModel):
    """
    The unified data transfer object between backend and frontend.
    """

    structure: Structure
    visualization: Visualization
    trajectory: Optional[List[Structure]] = None


class VisualizationParams(BaseModel):
    bond_scale: float = 1.0
    h_bond_distance_cutoff: float = 3.5
    h_bond_angle_cutoff: float = 120.0
    bond_overrides: Dict[str, str] = Field(default_factory=dict)
    bond_inference_mode: BondInferenceMode = "auto"
    include_bond_diagnostics: bool = False


class UpdateStructureRequest(BaseModel):
    structure: Structure
    params: VisualizationParams


class DetectRingRequest(BaseModel):
    structure: Dict[str, Any]
    indices: List[int]
    bond_overrides: Optional[Dict[str, str]] = None
    bond_scale: float = 1.1


class DetectRingResponse(BaseModel):
    is_ring: bool
    ring_data: Optional[Tuple[List[float], List[float], float]] = None


class DeleteBondsRequest(BaseModel):
    structure: Dict[str, Any]
    bond_ids: List[str]
    bond_overrides: Optional[Dict[str, str]] = None
    bond_scale: float = 1.1


class CreateBondRequest(BaseModel):
    structure: Dict[str, Any]
    bond_id: str
    bond_overrides: Optional[Dict[str, str]] = None
    bond_scale: float = 1.1


class ExportWarning(BaseModel):
    code: str
    severity: Literal["error", "warning", "info"]
    message: str
    details: Optional[Dict[str, str]] = None


class ExportRequest(BaseModel):
    format: str
    scope: Literal["current_frame", "full_trajectory"]
    structure: Structure
    trajectory: Optional[List[Structure]] = None
    fixed_atoms: List[int] = Field(default_factory=list)
    structure_version: int
    file_name: Optional[str] = None
