from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from ase.io import read, write
from ase.constraints import FixAtoms
from ase import Atoms
from collections.abc import Iterable
import logging
import tempfile
import os
import json
from typing import Any, List, cast
from pathlib import Path

from ..models import (
    ExportRequest,
    ExportWarning,
    StandardStructureObject,
    Structure,
    UpdateStructureRequest,
    Visualization,
)
from ..services.geometry import get_bonds_and_ghosts, calc_h_bond_geometries
from ..services.structure_utils import (
    _generate_atom_labels,
    atoms_from_dict,
    atoms_to_response,
    atoms_to_structure,
    wrap_atoms_for_display,
)
from ..services.format_capabilities import (
    WarningSeverity,
    check_export_compatibility,
    resolve_ase_write_format,
)

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_EXPORT_TRAJECTORY_FRAMES = 1000

# Generous default upload ceiling — normal local files never reach it. Override
# with ATOMCANVAS_MAX_UPLOAD_MB. This guards against an accidental (or, on a
# shared LAN, malicious) huge file exhausting server memory.
DEFAULT_MAX_UPLOAD_MB = 256


def _max_upload_bytes() -> int:
    """Resolve the upload size limit (bytes) from ATOMCANVAS_MAX_UPLOAD_MB.

    Read per-request so it is overridable/testable; a missing or invalid value
    falls back to the generous default rather than failing the upload.
    """
    raw = os.environ.get("ATOMCANVAS_MAX_UPLOAD_MB", str(DEFAULT_MAX_UPLOAD_MB))
    try:
        mb = float(raw)
    except (TypeError, ValueError):
        mb = DEFAULT_MAX_UPLOAD_MB
    if mb <= 0:
        mb = DEFAULT_MAX_UPLOAD_MB
    return int(mb * 1024 * 1024)


async def _read_upload_capped(file: UploadFile, max_bytes: int) -> bytes:
    """Read an upload into memory in chunks, aborting with HTTP 413 as soon as
    it exceeds ``max_bytes`` instead of letting an oversized file grow unbounded.
    """
    buffer = bytearray()
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            limit_mb = max_bytes // (1024 * 1024)
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Uploaded file exceeds the {limit_mb} MB limit. "
                    "Raise it with the ATOMCANVAS_MAX_UPLOAD_MB environment variable."
                ),
            )
    return bytes(buffer)


def _sanitize_upload_filename(filename: str | None) -> str:
    default_name = "uploaded_structure"
    if filename is None:
        return default_name

    try:
        raw = str(filename).replace("\x00", "").strip()
    except Exception:
        return default_name

    if raw in {"", ".", ".."}:
        return default_name

    try:
        candidate = Path(raw).name.strip()
    except Exception:
        candidate = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].strip()

    if candidate in {"", ".", ".."}:
        return default_name
    return candidate


# VASP files carry no extension; hint the reader by conventional stem so an
# uploaded POSCAR/CONTCAR/OUTCAR/XDATCAR is read as the right VASP flavour
# before autodetect.
_VASP_STEM_HINTS: dict[str, list[str]] = {
    "POSCAR": ["vasp"],
    "CONTCAR": ["vasp"],
    "OUTCAR": ["vasp-out"],
    "XDATCAR": ["vasp-xdatcar"],
}


def _upload_format_candidates(filename: str) -> List[str]:
    path = Path(filename)
    if path.suffix.lower() == ".cif":
        return ["cif"]
    stem_hint = _VASP_STEM_HINTS.get(path.stem.upper())
    if stem_hint:
        return list(stem_hint)
    return []


@router.post("/upload", response_model=StandardStructureObject)
async def upload_structure(file: UploadFile = File(...)):
    upload_name = "uploaded_structure"
    try:
        upload_name = _sanitize_upload_filename(file.filename)
        with tempfile.TemporaryDirectory(prefix="ase-upload-") as tmp_dir:
            tmp_path = os.path.join(tmp_dir, upload_name)
            file_bytes = await _read_upload_capped(file, _max_upload_bytes())
            if not file_bytes:
                raise HTTPException(status_code=400, detail="Uploaded file is empty.")

            with open(tmp_path, "wb") as tmp:
                tmp.write(file_bytes)

            parsed_atoms = None
            parse_attempt_errors: List[str] = []

            for format_hint in _upload_format_candidates(upload_name):
                try:
                    parsed_atoms = read(tmp_path, index=":", format=format_hint)
                    break
                except Exception as exc:
                    parse_attempt_errors.append(f"{format_hint}: {exc}")

            try:
                if parsed_atoms is None:
                    parsed_atoms = read(tmp_path, index=":")
            except Exception as exc:
                if parse_attempt_errors:
                    attempts = " | ".join(parse_attempt_errors)
                    detail = (
                        f"ASE could not read file '{upload_name}': {exc}. "
                        f"Tried explicit format hints before autodetect: {attempts}"
                    )
                else:
                    detail = f"ASE could not read file '{upload_name}': {exc}"
                raise HTTPException(
                    status_code=400,
                    detail=detail,
                ) from exc

            if isinstance(parsed_atoms, Atoms):
                atoms_list: List[Atoms] = [parsed_atoms]
            elif isinstance(parsed_atoms, Iterable):
                atoms_list = [
                    frame for frame in parsed_atoms if isinstance(frame, Atoms)
                ]
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"ASE parser returned unsupported payload type for '{upload_name}'.",
                )

            if not atoms_list:
                raise HTTPException(
                    status_code=400,
                    detail="Could not parse any structures from the file.",
                )

            frames = atoms_list
            if len(frames) > 100:
                step = len(frames) // 100
                frames = frames[::step]

            # Trajectory frames keep RAW, continuous coordinates so MD playback
            # does not teleport atoms across PBC boundaries between frames. Each
            # Structure still carries its own wrapped_positions for any wrapped
            # display; the static main structure is wrapped-for-geometry via
            # atoms_to_response(atoms_list[0]) below.
            trajectory_data = [atoms_to_structure(f) for f in frames]

            atoms = atoms_list[0]
            if not isinstance(atoms, Atoms):
                raise HTTPException(
                    status_code=400, detail="Expected Atoms object from parser."
                )

            response_obj = atoms_to_response(atoms)
            response_obj.trajectory = trajectory_data

            return response_obj

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Upload failed for %s", upload_name)
        raise HTTPException(
            status_code=500,
            detail="An unexpected server error occurred during upload.",
        ) from exc
    finally:
        await file.close()


@router.post("/update_visualization", response_model=Visualization)
async def update_visualization(request: UpdateStructureRequest):
    try:
        # Use atoms_from_dict to correctly handle nested structure and visualization (fixed_atoms)
        atoms = atoms_from_dict(request.structure.model_dump())
        # Recompute bonds in the same wrapped basis the upload/edit paths serialize,
        # so ghost stubs stay anchored to the positions the renderer already holds.
        atoms = wrap_atoms_for_display(atoms)

        params = request.params
        bond_diagnostics_payload: dict[str, Any] | None = (
            {} if params.include_bond_diagnostics else None
        )

        # Recalculate everything consistently using the same service components
        kekule_orders: dict[str, float] = {}
        bonds, wrapped_ghost_bonds, rings = get_bonds_and_ghosts(
            atoms,
            bond_scale=params.bond_scale,
            bond_overrides=params.bond_overrides,
            bond_inference_mode=params.bond_inference_mode,
            diagnostics=bond_diagnostics_payload,
            kekule_out=kekule_orders,
        )
        wrapped_h_bonds, unwrapped_h_bonds = calc_h_bond_geometries(
            atoms,
            distance_cutoff=params.h_bond_distance_cutoff,
            angle_cutoff=params.h_bond_angle_cutoff,
        )
        atom_labels = _generate_atom_labels(atoms)

        # Extract fixed atoms correctly using the safer get_indices()
        fixed_atoms_indices = []
        if atoms.constraints:
            for constr in atoms.constraints:
                if isinstance(constr, FixAtoms):
                    fixed_atoms_indices.extend(constr.get_indices().tolist())

        visualization_payload: dict[str, Any] = {
            "bonds": bonds,
            "rings": rings,
            "wrapped_ghost_bonds": wrapped_ghost_bonds,
            "h_bond_geometries": wrapped_h_bonds,
            "unwrapped_h_bonds": unwrapped_h_bonds,
            "labels": atom_labels,
            "fixed_atoms": sorted(list(set(fixed_atoms_indices))),
            "kekule_orders": kekule_orders,
        }
        if bond_diagnostics_payload is not None:
            visualization_payload["bond_diagnostics"] = bond_diagnostics_payload

        return Visualization(**visualization_payload)

    except Exception as e:
        logger.exception("Update visualization failed")
        raise HTTPException(
            status_code=500,
            detail="An unexpected server error occurred while updating the visualization.",
        ) from e


def _serialize_export_warning(warning) -> ExportWarning:
    return ExportWarning(
        code=warning.code,
        severity=warning.severity.value,
        message=warning.message,
        details=warning.details,
    )


def _build_atoms_with_constraints(
    structure: Structure, fixed_atoms: list[int]
) -> Atoms:
    payload = cast(
        dict[str, object],
        {
            "structure": structure.model_dump(),
            "visualization": {"fixed_atoms": fixed_atoms},
        },
    )
    return atoms_from_dict(payload)


@router.post("/export")
async def export_structure(request: ExportRequest):
    try:
        format_name = request.format.strip().lower()
        base_atoms = _build_atoms_with_constraints(
            request.structure, request.fixed_atoms
        )

        raw_warnings = check_export_compatibility(
            format_name=format_name,
            scope=request.scope,
            is_periodic=bool(base_atoms.pbc.any()),
            has_constraints=bool(request.fixed_atoms),
        )
        warnings = [_serialize_export_warning(w) for w in raw_warnings]

        hard_errors = [w for w in warnings if w.severity == WarningSeverity.ERROR.value]
        if hard_errors:
            first_error = hard_errors[0]
            raise HTTPException(
                status_code=409,
                detail={
                    "code": first_error.code,
                    "message": first_error.message,
                    "details": first_error.details,
                },
            )

        if request.scope == "full_trajectory":
            if request.trajectory:
                images = [
                    _build_atoms_with_constraints(frame, request.fixed_atoms)
                    for frame in request.trajectory
                ]
            else:
                images = [base_atoms]
        else:
            images = [base_atoms]

        if len(images) > MAX_EXPORT_TRAJECTORY_FRAMES:
            raise HTTPException(
                status_code=413,
                detail={
                    "code": "TRAJECTORY_TOO_LARGE",
                    "message": f"Trajectory frame count exceeds limit ({MAX_EXPORT_TRAJECTORY_FRAMES}).",
                },
            )

        if request.scope == "full_trajectory" and any(
            w.code == "TRAJECTORY_TRUNCATED" for w in warnings
        ):
            images = [images[0]]

        file_suffix = format_name if format_name != "vasp-xdatcar" else "xdatcar"
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_suffix}") as tmp:
            tmp_path = tmp.name

        # Once the temp file exists on disk, every code path below must either
        # hand ownership to FileResponse's BackgroundTask (which deletes after
        # streaming) or remove the file itself. If `write()` raises, the
        # BackgroundTask is never registered, so the tmp file would otherwise
        # leak and pile up across failed exports.
        try:
            ase_format = resolve_ase_write_format(format_name)
            if len(images) == 1:
                write(tmp_path, images[0], format=ase_format)
            else:
                write(tmp_path, images, format=ase_format)

            file_name = request.file_name or f"structure_export.{file_suffix}"
            headers = {
                "x-export-warnings": json.dumps(
                    [warning.model_dump() for warning in warnings]
                ),
            }

            return FileResponse(
                path=tmp_path,
                media_type="application/octet-stream",
                filename=file_name,
                headers=headers,
                background=BackgroundTask(
                    lambda: os.path.exists(tmp_path) and os.remove(tmp_path)
                ),
            )
        except Exception:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
            raise

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "UNKNOWN_FORMAT",
                "message": str(exc),
            },
        )
    except Exception as exc:
        logger.exception("Structure export failed")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "EXPORT_FAILED",
                "message": "An unexpected server error occurred during export.",
            },
        ) from exc
