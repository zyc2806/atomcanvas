from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from ase import Atoms
from ase.io import write

from .format_capabilities import (
    ExportWarning,
    WarningSeverity,
    check_export_compatibility,
    resolve_ase_write_format,
)


MAX_EXPORT_TRAJECTORY_FRAMES = 1000


@dataclass(frozen=True)
class ExportExecutionResult:
    output_path: Path
    format_name: str
    scope: str
    exported_frames: int
    warnings: list[ExportWarning]


def export_atoms_to_file(
    *,
    images: list[Atoms],
    output_path: str | Path,
    format_name: str,
    scope: Literal["current_frame", "full_trajectory"],
) -> ExportExecutionResult:
    normalized_format = format_name.strip().lower()
    if not images:
        raise ValueError("No structures available for export.")

    is_periodic = bool(images[0].pbc.any())
    has_constraints = any(bool(image.constraints) for image in images)
    validated_scope: Literal["current_frame", "full_trajectory"] = scope
    warnings = check_export_compatibility(
        format_name=normalized_format,
        scope=validated_scope,
        is_periodic=is_periodic,
        has_constraints=has_constraints,
    )
    hard_errors = [
        warning for warning in warnings if warning.severity == WarningSeverity.ERROR
    ]
    if hard_errors:
        raise ValueError(hard_errors[0].message)

    export_images = images
    if len(export_images) > MAX_EXPORT_TRAJECTORY_FRAMES:
        raise ValueError(
            f"Trajectory frame count exceeds limit ({MAX_EXPORT_TRAJECTORY_FRAMES})."
        )

    if scope == "full_trajectory" and any(
        warning.code == "TRAJECTORY_TRUNCATED" for warning in warnings
    ):
        export_images = [export_images[0]]

    path = Path(output_path).expanduser()
    if path.exists():
        raise ValueError(f"Refusing to overwrite existing file: {path}")
    if path.suffix == "":
        raise ValueError("Export path must include a file extension.")

    path.parent.mkdir(parents=True, exist_ok=True)
    ase_format = resolve_ase_write_format(normalized_format)
    if len(export_images) == 1:
        write(str(path), export_images[0], format=ase_format)
    else:
        write(str(path), export_images, format=ase_format)

    return ExportExecutionResult(
        output_path=path.resolve(),
        format_name=normalized_format,
        scope=scope,
        exported_frames=len(export_images),
        warnings=warnings,
    )
