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


def test_supercell_writes_expanded_cell(runner, tmp_path):
    import numpy as np
    from ase import Atoms as _Atoms
    src = tmp_path / "bulk.cif"
    _Atoms("Cu", positions=[[0, 0, 0]], cell=np.eye(3) * 3.0, pbc=True).write(str(src))
    out = tmp_path / "super.cif"
    result = runner.invoke(cli, ["supercell", str(src), str(out), "--reps", "2", "2", "2"])
    assert result.exit_code == 0, result.output
    assert read(str(out)).get_global_number_of_atoms() == 8


def test_supercell_rejects_bad_reps(runner, tmp_path):
    import numpy as np
    from ase import Atoms as _Atoms
    src = tmp_path / "bulk.cif"
    _Atoms("Cu", positions=[[0, 0, 0]], cell=np.eye(3) * 3.0, pbc=True).write(str(src))
    out = tmp_path / "super.cif"
    result = runner.invoke(cli, ["supercell", str(src), str(out), "--reps", "0", "1", "1"])
    assert result.exit_code != 0


def test_translate_shifts_positions(runner, tmp_path):
    out = tmp_path / "shifted.xyz"
    result = runner.invoke(cli, ["translate", str(WATER), str(out), "--vector", "1", "0", "0"])
    assert result.exit_code == 0, result.output
    before = read(str(WATER)).get_positions()
    after = read(str(out)).get_positions()
    assert abs((after[0][0] - before[0][0]) - 1.0) < 1e-6


def test_bond_delete_removes_a_bond(runner):
    # water has 2 bonds (O-H1, O-H2); deleting 0-1 leaves 1.
    base = runner.invoke(cli, ["bonds", str(WATER), "--json"])
    import json as _json
    n_before = _json.loads(base.output)["bonds"].__len__()
    result = runner.invoke(cli, ["bond", str(WATER), "--delete", "0", "1", "--json"])
    assert result.exit_code == 0, result.output
    payload = _json.loads(result.output)
    assert len(payload["bonds"]) == n_before - 1
    assert payload["overrides"]["0-1"] == "delete"


def test_bond_create_adds_an_override(runner):
    result = runner.invoke(cli, ["bond", str(WATER), "--create", "1", "2", "--json"])
    assert result.exit_code == 0, result.output
    import json as _json
    assert _json.loads(result.output)["overrides"]["1-2"] == "1.0"


def test_hbonds_runs_and_reports_count(runner):
    # water alone has no inter-molecular H-bonds; the command must still run and report 0.
    result = runner.invoke(cli, ["hbonds", str(WATER), "--json"])
    assert result.exit_code == 0, result.output
    import json as _json
    payload = _json.loads(result.output)
    assert "h_bonds" in payload
    assert isinstance(payload["h_bonds"], int)
    assert payload["h_bonds"] == 0
