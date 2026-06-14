"""Tests for the headless AtomCanvas CLI (`app.cli`).

The CLI is the scriptable chemistry core: load a structure, detect bonds /
orders / rings, evaluate selections, and re-export structure files — all without
the browser. It calls the pure service layer directly (no FastAPI).
"""

import json
import re
from pathlib import Path

import pytest
from click.testing import CliRunner

from app.cli import cli

WATER = Path(__file__).resolve().parents[2] / "fixtures" / "water.xyz"


@pytest.fixture
def runner():
    return CliRunner()


def test_bonds_human_output(runner):
    result = runner.invoke(cli, ["bonds", str(WATER)])
    assert result.exit_code == 0, result.output
    # water bonds O-H1, O-H2 -> two bonds
    assert "2 bonds" in result.output


def test_bonds_json_output(runner):
    result = runner.invoke(cli, ["bonds", str(WATER), "--json"])
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert len(payload["bonds"]) == 2
    # each bond is [i, j, order]
    assert all(len(b) == 3 for b in payload["bonds"])
    assert payload["n_atoms"] == 3


def test_info(runner):
    result = runner.invoke(cli, ["info", str(WATER)])
    assert result.exit_code == 0, result.output
    assert "H2O" in result.output
    assert re.search(r"^atoms:\s+3$", result.output, re.MULTILINE)


def test_select_returns_json_indices(runner):
    result = runner.invoke(cli, ["select", str(WATER), "elem:O"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.output) == [0]


def test_convert_writes_file(runner, tmp_path):
    out = tmp_path / "water.cif"
    result = runner.invoke(cli, ["convert", str(WATER), str(out)])
    assert result.exit_code == 0, result.output
    assert out.is_file()
    assert out.stat().st_size > 0


@pytest.mark.parametrize("ext", ["xyz", "extxyz", "traj"])
def test_convert_molecular_formats(runner, tmp_path, ext):
    """Non-periodic formats the CLI advertises must write a non-empty file."""
    out = tmp_path / f"water.{ext}"
    result = runner.invoke(cli, ["convert", str(WATER), str(out)])
    assert result.exit_code == 0, result.output
    assert out.is_file() and out.stat().st_size > 0


def test_convert_vasp_needs_periodic_structure(runner, tmp_path):
    """VASP requires a cell: a periodic input converts; a molecule errors cleanly."""
    from ase import Atoms
    from ase.io import write as ase_write

    bulk = tmp_path / "bulk.extxyz"
    ase_write(str(bulk), Atoms("Cu", positions=[[0, 0, 0]], cell=[3, 3, 3], pbc=True))
    out = tmp_path / "bulk.vasp"
    ok = runner.invoke(cli, ["convert", str(bulk), str(out)])
    assert ok.exit_code == 0, ok.output
    assert out.is_file() and out.stat().st_size > 0

    # A non-periodic molecule to VASP fails cleanly, not with a traceback.
    bad = runner.invoke(cli, ["convert", str(WATER), str(tmp_path / "water.vasp")])
    assert bad.exit_code != 0
    assert "Traceback" not in bad.output


def test_convert_pdb_is_a_clean_error(runner, tmp_path):
    # PDB is not writable through the export pipeline (the capability registry
    # keys it 'pdb' but ase.io.write only knows 'proteindatabank'), so the CLI
    # must not advertise it. Asking for .pdb fails cleanly without writing.
    out = tmp_path / "water.pdb"
    result = runner.invoke(cli, ["convert", str(WATER), str(out)])
    assert result.exit_code != 0
    assert "Traceback" not in result.output
    assert not out.exists()


def test_convert_extensionless_is_a_clean_error(runner, tmp_path):
    # The export service refuses extensionless paths, so VASP output needs a
    # .vasp extension — a bare "POSCAR" target must fail cleanly, not silently.
    out = tmp_path / "POSCAR"
    result = runner.invoke(cli, ["convert", str(WATER), str(out)])
    assert result.exit_code != 0
    assert "Traceback" not in result.output
    assert not out.exists()


def test_convert_refuses_to_overwrite(runner, tmp_path):
    out = tmp_path / "exists.cif"
    out.write_text("do not clobber")
    result = runner.invoke(cli, ["convert", str(WATER), str(out)])
    assert result.exit_code != 0
    # clean message, not a raw traceback
    assert "Traceback" not in result.output
    assert out.read_text() == "do not clobber"


def test_unreadable_file_is_clean_error(runner, tmp_path):
    missing = tmp_path / "nope.xyz"
    result = runner.invoke(cli, ["bonds", str(missing)])
    assert result.exit_code != 0
    assert "Traceback" not in result.output
