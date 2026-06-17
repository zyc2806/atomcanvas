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
from ase import Atoms
from ase.io import read, write

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


def test_convert_pdb_writes(runner, tmp_path):
    # PDB now round-trips via the proteindatabank alias: the capability registry
    # key 'pdb' is resolved to 'proteindatabank' before calling ase.io.write, so
    # .pdb extension is mapped in _EXT_TO_FORMAT and the write succeeds.
    out = tmp_path / "water.pdb"
    result = runner.invoke(cli, ["convert", str(WATER), str(out)])
    assert result.exit_code == 0, result.output
    assert out.is_file()
    assert out.stat().st_size > 0
    assert "Traceback" not in result.output


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


def _write_ch4(path):
    # 1 C + 4 H
    atoms = Atoms('CH4', positions=[
        (0, 0, 0), (0.6, 0.6, 0.6), (-0.6, -0.6, 0.6),
        (-0.6, 0.6, -0.6), (0.6, -0.6, -0.6),
    ])
    write(str(path), atoms)


def test_convert_select_exports_subset(tmp_path):
    src = tmp_path / "ch4.xyz"
    out = tmp_path / "carbons.xyz"
    _write_ch4(src)
    runner = CliRunner()
    result = runner.invoke(cli, ["convert", str(src), str(out), "--select", "elem:C"])
    assert result.exit_code == 0, result.output
    assert len(read(str(out))) == 1  # only the carbon survives


def test_convert_select_empty_match_errors(tmp_path):
    src = tmp_path / "ch4.xyz"
    out = tmp_path / "none.xyz"
    _write_ch4(src)
    runner = CliRunner()
    result = runner.invoke(cli, ["convert", str(src), str(out), "--select", "elem:Xe"])
    assert result.exit_code != 0
    assert "0 atoms" in result.output


def test_select_ast_prints_ast_json(tmp_path):
    src = tmp_path / "ch4.xyz"
    _write_ch4(src)
    runner = CliRunner()
    result = runner.invoke(cli, ["select", str(src), "elem:C AND pos:z>0", "--ast"])
    assert result.exit_code == 0, result.output
    parsed = json.loads(result.output)
    assert isinstance(parsed, dict)  # an AST node object
