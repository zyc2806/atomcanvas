"""Tests for VASP-stem upload format hints and integration."""
import io
import tempfile

import pytest
from ase import Atoms
from ase.io import write
from fastapi.testclient import TestClient

from app.routers.structure import _upload_format_candidates


# ─── Unit tests ────────────────────────────────────────────────────────────────


class TestUploadFormatCandidates:
    def test_poscar_returns_vasp(self):
        assert _upload_format_candidates("POSCAR") == ["vasp"]

    def test_contcar_returns_vasp(self):
        assert _upload_format_candidates("CONTCAR") == ["vasp"]

    def test_outcar_returns_vasp_out(self):
        assert _upload_format_candidates("OUTCAR") == ["vasp-out"]

    def test_xdatcar_returns_vasp_xdatcar(self):
        assert _upload_format_candidates("XDATCAR") == ["vasp-xdatcar"]

    def test_cif_returns_cif(self):
        assert _upload_format_candidates("foo.cif") == ["cif"]

    def test_xyz_returns_empty(self):
        assert _upload_format_candidates("foo.xyz") == []

    def test_unknown_extension_returns_empty(self):
        assert _upload_format_candidates("molecule.mol") == []

    def test_case_insensitive_stem_poscar(self):
        assert _upload_format_candidates("poscar") == ["vasp"]

    def test_case_insensitive_stem_contcar(self):
        assert _upload_format_candidates("contcar") == ["vasp"]

    def test_case_insensitive_stem_outcar(self):
        assert _upload_format_candidates("outcar") == ["vasp-out"]

    def test_case_insensitive_stem_xdatcar(self):
        assert _upload_format_candidates("xdatcar") == ["vasp-xdatcar"]

    def test_cif_uppercase_extension(self):
        assert _upload_format_candidates("foo.CIF") == ["cif"]


# ─── Integration test ──────────────────────────────────────────────────────────


def _make_bulk_atoms() -> Atoms:
    """Return a simple periodic bulk structure suitable for VASP I/O."""
    from ase.build import bulk
    return bulk("Al", "fcc", a=4.05)


def test_upload_poscar_filename_parsed_correctly(client: TestClient) -> None:
    """Uploading a VASP POSCAR-format file with filename 'POSCAR' must succeed.

    The backend now hints ASE with format='vasp' based on the stem, so the
    file is read as a VASP POSCAR rather than falling through to autodetect.
    """
    atoms = _make_bulk_atoms()
    with tempfile.NamedTemporaryFile(suffix=".vasp", delete=False) as tmp:
        write(tmp.name, atoms, format="vasp")
        tmp_path = tmp.name

    with open(tmp_path, "rb") as fh:
        data = fh.read()

    response = client.post(
        "/api/structure/upload",
        files={"file": ("POSCAR", data, "text/plain")},
    )

    assert response.status_code == 200
    result = response.json()
    symbols = result["structure"]["symbols"]
    assert len(symbols) == len(atoms), (
        f"Expected {len(atoms)} atoms, got {len(symbols)}"
    )
