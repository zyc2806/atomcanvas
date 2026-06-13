from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal


class WarningSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass(frozen=True)
class ExportWarning:
    code: str
    severity: WarningSeverity
    message: str
    details: dict[str, str] | None = None


@dataclass(frozen=True)
class FormatCapability:
    name: str
    supports_read: bool
    supports_write: bool
    supports_multiple_frames: bool
    supports_periodic: bool
    requires_periodic: bool
    supports_constraints: bool


FORMAT_CAPABILITIES: dict[str, FormatCapability] = {
    "xyz": FormatCapability(
        name="xyz",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=False,
        supports_periodic=False,
        requires_periodic=False,
        supports_constraints=False,
    ),
    "extxyz": FormatCapability(
        name="extxyz",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=True,
        supports_periodic=True,
        requires_periodic=False,
        supports_constraints=True,
    ),
    "cif": FormatCapability(
        name="cif",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=True,
        supports_periodic=True,
        requires_periodic=False,
        supports_constraints=False,
    ),
    "vasp": FormatCapability(
        name="vasp",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=False,
        supports_periodic=True,
        requires_periodic=True,
        supports_constraints=True,
    ),
    "xdatcar": FormatCapability(
        name="xdatcar",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=True,
        supports_periodic=True,
        requires_periodic=True,
        supports_constraints=False,
    ),
    "vasp-xdatcar": FormatCapability(
        name="vasp-xdatcar",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=True,
        supports_periodic=True,
        requires_periodic=True,
        supports_constraints=False,
    ),
    "traj": FormatCapability(
        name="traj",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=True,
        supports_periodic=True,
        requires_periodic=False,
        supports_constraints=True,
    ),
    "json": FormatCapability(
        name="json",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=True,
        supports_periodic=True,
        requires_periodic=False,
        supports_constraints=True,
    ),
    "pdb": FormatCapability(
        name="pdb",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=False,
        supports_periodic=False,
        requires_periodic=False,
        supports_constraints=False,
    ),
    "mol": FormatCapability(
        name="mol",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=False,
        supports_periodic=False,
        requires_periodic=False,
        supports_constraints=False,
    ),
    "cube": FormatCapability(
        name="cube",
        supports_read=True,
        supports_write=True,
        supports_multiple_frames=False,
        supports_periodic=True,
        requires_periodic=False,
        supports_constraints=False,
    ),
}


def get_format_capability(format_name: str) -> FormatCapability:
    key = format_name.strip().lower()
    capability = FORMAT_CAPABILITIES.get(key)
    if capability is None:
        supported = ", ".join(sorted(FORMAT_CAPABILITIES.keys()))
        raise ValueError(
            f"Unknown format: {format_name!r}. Supported: {supported}."
        )
    return capability


def check_export_compatibility(
    format_name: str,
    scope: Literal["current_frame", "full_trajectory"],
    is_periodic: bool,
    has_constraints: bool,
) -> list[ExportWarning]:
    capability = get_format_capability(format_name)
    warnings: list[ExportWarning] = []

    if is_periodic and not capability.supports_periodic:
        warnings.append(
            ExportWarning(
                code="PERIODIC_NOT_SUPPORTED",
                severity=WarningSeverity.ERROR,
                message=f"Format '{capability.name}' does not support periodic structures.",
                details={"format": capability.name},
            )
        )

    if not is_periodic and capability.requires_periodic:
        warnings.append(
            ExportWarning(
                code="PERIODIC_REQUIRED",
                severity=WarningSeverity.ERROR,
                message=f"Format '{capability.name}' requires periodic structure data.",
                details={"format": capability.name},
            )
        )

    if scope == "full_trajectory" and not capability.supports_multiple_frames:
        warnings.append(
            ExportWarning(
                code="TRAJECTORY_TRUNCATED",
                severity=WarningSeverity.WARNING,
                message=f"Format '{capability.name}' does not support full trajectories; export may be truncated.",
                details={"format": capability.name},
            )
        )

    if has_constraints and not capability.supports_constraints:
        warnings.append(
            ExportWarning(
                code="CONSTRAINTS_DROPPED",
                severity=WarningSeverity.WARNING,
                message=f"Format '{capability.name}' does not preserve all constraints.",
                details={"format": capability.name},
            )
        )

    return warnings
