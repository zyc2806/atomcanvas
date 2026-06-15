"""Unit tests for format_capabilities helpers."""

import pytest

from app.services.format_capabilities import (
    WarningSeverity,
    check_export_compatibility,
    resolve_ase_write_format,
)


# ---------------------------------------------------------------------------
# resolve_ase_write_format
# ---------------------------------------------------------------------------

def test_pdb_resolves_to_proteindatabank():
    assert resolve_ase_write_format("pdb") == "proteindatabank"


def test_cif_resolves_to_cif():
    assert resolve_ase_write_format("cif") == "cif"


def test_upper_case_input_normalised():
    # "CIF" should be normalised to "cif" and then resolve to "cif"
    assert resolve_ase_write_format("CIF") == "cif"


def test_unknown_format_raises_value_error():
    # The resolver validates via get_format_capability, so a non-registry key
    # (here the ASE-internal name, which is NOT a registry key) must raise. This
    # is the load-bearing path the router turns into 400 UNKNOWN_FORMAT.
    with pytest.raises(ValueError, match="Unknown format"):
        resolve_ase_write_format("proteindatabank")


# ---------------------------------------------------------------------------
# check_export_compatibility — WRITE_NOT_SUPPORTED
# ---------------------------------------------------------------------------

def test_mol_produces_write_not_supported_error():
    warnings = check_export_compatibility(
        "mol",
        "current_frame",
        is_periodic=False,
        has_constraints=False,
    )
    codes = [w.code for w in warnings]
    assert "WRITE_NOT_SUPPORTED" in codes
    # It must be an ERROR severity so it blocks the export
    nsw = next(w for w in warnings if w.code == "WRITE_NOT_SUPPORTED")
    assert nsw.severity == WarningSeverity.ERROR


def test_xyz_has_no_write_not_supported():
    warnings = check_export_compatibility(
        "xyz",
        "current_frame",
        is_periodic=False,
        has_constraints=False,
    )
    codes = [w.code for w in warnings]
    assert "WRITE_NOT_SUPPORTED" not in codes


def test_xdatcar_resolves_to_vasp_xdatcar():
    """The 'xdatcar' registry key must alias to 'vasp-xdatcar'.

    ase.io.write(format='xdatcar') raises UnknownFileTypeError; the real ASE
    format string is 'vasp-xdatcar'.  This test fails until ase_write_format
    is added to the 'xdatcar' entry.
    """
    assert resolve_ase_write_format("xdatcar") == "vasp-xdatcar"
