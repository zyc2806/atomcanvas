import os
from pathlib import Path

import pytest
from click.testing import CliRunner

from app.cli import cli

WATER = Path(__file__).resolve().parents[2] / "fixtures" / "water.xyz"


@pytest.fixture
def runner():
    return CliRunner()


def test_render_rejects_bad_size(runner):
    result = runner.invoke(cli, ["render", str(WATER), "-o", "out.png", "--size", "nope"])
    assert result.exit_code != 0
    assert "size" in result.output.lower()


def test_render_requires_an_output(runner):
    result = runner.invoke(cli, ["render", str(WATER)])
    assert result.exit_code != 0
    assert "output" in result.output.lower() or "-o" in result.output.lower()


def test_render_missing_playwright_is_clean(runner, monkeypatch):
    # Simulate playwright not installed: force the dependency check to fail.
    import app.services.render_browser as rb

    def boom(*a, **k):
        raise rb.RenderDependencyError(
            'Headless render needs Playwright. Install it with: '
            'pip install "atomcanvas[render]" && playwright install chromium'
        )

    monkeypatch.setattr(rb, "render_structure", boom)
    result = runner.invoke(cli, ["render", str(WATER), "-o", "out.png"])
    assert result.exit_code != 0
    assert "playwright" in result.output.lower()
    assert "Traceback" not in result.output


def test_render_no_gizmo_forwards_hide_gizmo(runner, monkeypatch, tmp_path):
    # --no-gizmo must reach the driver as hide_gizmo=True; without it, the
    # default is False. Stub the driver + bundle build so this is a fast,
    # browser-free wiring check.
    import app.cli as cli_mod
    import app.services.render_browser as rb

    captured = {}

    def fake_render(**kwargs):
        captured.clear()
        captured.update(kwargs)
        return {"png": kwargs.get("out_png"), "glb": None, "n_atoms": 3}

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", fake_render)

    out = str(tmp_path / "x.png")
    r1 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-gizmo", "--no-build"])
    assert r1.exit_code == 0, r1.output
    assert captured.get("hide_gizmo") is True

    r2 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r2.exit_code == 0, r2.output
    assert captured.get("hide_gizmo") is False


def test_render_no_aromatic_rings_forwards_flag(runner, monkeypatch, tmp_path):
    # --no-aromatic-rings must reach the driver as hide_aromatic_rings=True;
    # without it the default is False (torus stays, matching the viewer default).
    import app.cli as cli_mod
    import app.services.render_browser as rb

    captured = {}

    def fake_render(**kwargs):
        captured.clear()
        captured.update(kwargs)
        return {"png": kwargs.get("out_png"), "glb": None, "n_atoms": 3}

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", fake_render)

    out = str(tmp_path / "x.png")
    r1 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-aromatic-rings", "--no-build"])
    assert r1.exit_code == 0, r1.output
    assert captured.get("hide_aromatic_rings") is True

    r2 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r2.exit_code == 0, r2.output
    assert captured.get("hide_aromatic_rings") is False


def test_render_brightness_forwards_to_driver(runner, monkeypatch, tmp_path):
    # --brightness must reach the driver as a float; without it, the default is
    # None (the viewer keeps globalBrightness=1.0). Out-of-range values are
    # rejected by click before the driver is touched.
    import app.cli as cli_mod
    import app.services.render_browser as rb

    captured = {}

    def fake_render(**kwargs):
        captured.clear()
        captured.update(kwargs)
        return {"png": kwargs.get("out_png"), "glb": None, "n_atoms": 3}

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", fake_render)

    out = str(tmp_path / "x.png")
    r1 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--brightness", "2.0", "--no-build"])
    assert r1.exit_code == 0, r1.output
    assert captured.get("brightness") == 2.0

    r2 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r2.exit_code == 0, r2.output
    assert captured.get("brightness") is None

    r3 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--brightness", "5.0", "--no-build"])
    assert r3.exit_code != 0
    assert "brightness" in r3.output.lower() or "2.0" in r3.output


def test_render_camera_forwards_to_driver(runner, monkeypatch, tmp_path):
    # --camera must reach the driver verbatim; default is None. An invalid value
    # is rejected by click before the driver is touched.
    import app.cli as cli_mod
    import app.services.render_browser as rb

    captured = {}

    def fake_render(**kwargs):
        captured.clear()
        captured.update(kwargs)
        return {"png": kwargs.get("out_png"), "glb": None, "n_atoms": 3}

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", fake_render)

    out = str(tmp_path / "x.png")
    r1 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--camera", "orthographic", "--no-build"])
    assert r1.exit_code == 0, r1.output
    assert captured.get("camera") == "orthographic"

    r2 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r2.exit_code == 0, r2.output
    assert captured.get("camera") is None

    r3 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--camera", "isometric", "--no-build"])
    assert r3.exit_code != 0


def test_render_overrides_forwards_parsed_json(runner, monkeypatch, tmp_path):
    # --overrides FILE must reach the driver as the parsed dict; default is None;
    # malformed JSON is a clean ClickException (no traceback).
    import json
    import app.cli as cli_mod
    import app.services.render_browser as rb

    captured = {}

    def fake_render(**kwargs):
        captured.clear()
        captured.update(kwargs)
        return {"png": kwargs.get("out_png"), "glb": None, "n_atoms": 3}

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", fake_render)

    out = str(tmp_path / "x.png")
    ov = tmp_path / "ov.json"
    payload = {"colors": {"0": "#cccccc"}, "radii": {"0": 0.6}}
    ov.write_text(json.dumps(payload))

    r1 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--overrides", str(ov), "--no-build"])
    assert r1.exit_code == 0, r1.output
    assert captured.get("overrides") == payload

    r2 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r2.exit_code == 0, r2.output
    assert captured.get("overrides") is None

    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    r3 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--overrides", str(bad), "--no-build"])
    assert r3.exit_code != 0
    assert "Traceback" not in r3.output


@pytest.fixture
def captured_render(monkeypatch):
    """Stubs the browser driver and the bundle build; yields the kwargs dict."""
    import app.cli as cli_mod
    import app.services.render_browser as rb

    captured = {}

    def fake_render(**kwargs):
        captured.clear()
        captured.update(kwargs)
        return {"png": kwargs.get("out_png"), "glb": None, "n_atoms": 3}

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", fake_render)
    return captured


def test_render_builds_the_bundle_by_default(runner, monkeypatch, tmp_path):
    # Regression: `flag_value=False, default=True` reads back as False in click
    # 8.3, which silently turned auto-build off — `render` then failed with
    # "Frontend bundle not found" instead of building it. Only --no-build may
    # skip the build.
    import app.cli as cli_mod
    import app.services.render_browser as rb

    seen = []
    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda _d, do_build: seen.append(do_build))
    monkeypatch.setattr(rb, "render_structure", lambda **k: {"png": k.get("out_png"), "glb": None, "n_atoms": 3})

    out = str(tmp_path / "x.png")
    assert runner.invoke(cli, ["render", str(WATER), "-o", out]).exit_code == 0
    assert runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"]).exit_code == 0
    assert seen == [True, False]


def test_render_view_forwards_camera_view(runner, captured_render, tmp_path):
    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, ["render", str(WATER), "-o", out, "--view", "side", "--no-build"])
    assert r.exit_code == 0, r.output
    assert captured_render["camera_view"] == {"direction": [0.0, -1.0, 0.0], "frame": "cartesian"}


def test_render_axis_is_an_alias_for_view(runner, captured_render, tmp_path):
    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, ["render", str(WATER), "-o", out, "--axis", "c", "--no-build"])
    assert r.exit_code == 0, r.output
    assert captured_render["camera_view"] == {"direction": [0.0, 0.0, 1.0], "frame": "lattice"}


def test_render_rejects_unknown_view_cleanly(runner, captured_render, tmp_path):
    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, ["render", str(WATER), "-o", out, "--view", "sideways", "--no-build"])
    assert r.exit_code != 0
    assert "Traceback" not in r.output
    assert "sideways" in r.output


def test_render_camera_pos_target_up_zoom_forward(runner, captured_render, tmp_path):
    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, [
        "render", str(WATER), "-o", out, "--no-build",
        "--camera-pos", "0,0,25", "--camera-target", "1,2,3", "--up", "0,1,0", "--camera-zoom", "2",
    ])
    assert r.exit_code == 0, r.output
    assert captured_render["camera_view"] == {
        "position": [0.0, 0.0, 25.0], "target": [1.0, 2.0, 3.0],
        "up": [0.0, 1.0, 0.0], "zoom": 2.0,
    }


def test_render_camera_refinements_need_a_placement(runner, captured_render, tmp_path):
    # --camera-target/--up/--camera-zoom on their own would silently do nothing,
    # since the camera would keep its auto-framed default.
    out = str(tmp_path / "x.png")
    for opt, value in [("--camera-target", "0,0,0"), ("--up", "0,0,1"), ("--camera-zoom", "2")]:
        r = runner.invoke(cli, ["render", str(WATER), "-o", out, opt, value, "--no-build"])
        assert r.exit_code != 0, f"{opt} alone should be rejected: {r.output}"
        assert "Traceback" not in r.output
        assert "--view" in r.output


def test_render_no_camera_options_means_no_camera_view(runner, captured_render, tmp_path):
    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r.exit_code == 0, r.output
    assert captured_render["camera_view"] is None


def test_render_ball_scale_forwards_to_driver(runner, captured_render, tmp_path):
    out = str(tmp_path / "x.png")
    r1 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--ball-scale", "0.4", "--no-build"])
    assert r1.exit_code == 0, r1.output
    assert captured_render["ball_scale"] == 0.4

    r2 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r2.exit_code == 0, r2.output
    assert captured_render["ball_scale"] is None

    r3 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--ball-scale", "0", "--no-build"])
    assert r3.exit_code != 0


def test_render_autoframe_flags(runner, captured_render, tmp_path):
    out = str(tmp_path / "x.png")
    r1 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-autoframe", "--no-build"])
    assert r1.exit_code == 0, r1.output
    assert captured_render["autoframe"] is False

    r2 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r2.exit_code == 0, r2.output
    assert captured_render["autoframe"] is True


def test_render_warns_when_no_autoframe_leaves_the_camera_unplaced(runner, captured_render, tmp_path):
    # Framing off + nothing aiming the camera = blank PNG; say so rather than
    # writing black pixels. Any placement (here --view) silences the warning.
    out = str(tmp_path / "x.png")
    bare = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-autoframe", "--no-build"])
    assert bare.exit_code == 0, bare.output
    assert "warning" in bare.output.lower()

    placed = runner.invoke(
        cli, ["render", str(WATER), "-o", out, "--no-autoframe", "--view", "side", "--no-build"]
    )
    assert placed.exit_code == 0, placed.output
    assert "warning" not in placed.output.lower()


def test_render_no_pbc_bonds_flag(runner, captured_render, tmp_path):
    out = str(tmp_path / "x.png")
    r1 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-pbc-bonds", "--no-build"])
    assert r1.exit_code == 0, r1.output
    assert captured_render["show_pbc_bonds"] is False

    r2 = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r2.exit_code == 0, r2.output
    assert captured_render["show_pbc_bonds"] is True


def test_render_select_subsets_the_structure_the_viewer_sees(runner, monkeypatch, tmp_path):
    # --select must reach the browser as an already-filtered file, so bonds,
    # framing and the glb all describe the subset. Water minus its oxygen
    # leaves the two hydrogens.
    from ase.io import read
    import app.cli as cli_mod
    import app.services.render_browser as rb

    seen = {}

    def fake_render(**kwargs):
        atoms = read(kwargs["structure_path"])
        seen["symbols"] = atoms.get_chemical_symbols()
        seen["path"] = kwargs["structure_path"]
        return {"png": kwargs.get("out_png"), "glb": None, "n_atoms": len(atoms)}

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", fake_render)

    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, ["render", str(WATER), "-o", out, "--select", "elem:H", "--no-build"])
    assert r.exit_code == 0, r.output
    assert seen["symbols"] == ["H", "H"]
    assert seen["path"] != str(WATER)  # staged copy, original untouched
    assert "kept 2 of 3" in r.output


def test_render_select_keeps_the_cell_so_lattice_views_still_work(runner, monkeypatch, tmp_path):
    # The staged subset must round-trip cell + pbc, or --view c and the cell box
    # would break for a sliced slab.
    from ase.build import fcc111
    from ase.io import read, write
    import app.cli as cli_mod
    import app.services.render_browser as rb

    slab_path = tmp_path / "slab.cif"
    slab = fcc111("Pt", size=(2, 2, 4), vacuum=6.0)
    write(str(slab_path), slab)

    seen = {}

    def fake_render(**kwargs):
        atoms = read(kwargs["structure_path"])
        seen["cell"] = atoms.get_cell().array.flatten().tolist()
        seen["pbc"] = list(atoms.pbc)
        seen["n"] = len(atoms)
        return {"png": kwargs.get("out_png"), "glb": None, "n_atoms": len(atoms)}

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", fake_render)

    out = str(tmp_path / "x.png")
    top_half = slab.positions[:, 2].mean()
    r = runner.invoke(
        cli, ["render", str(slab_path), "-o", out, "--select", f"pos:z>{top_half}", "--no-build"]
    )
    assert r.exit_code == 0, r.output
    assert seen["n"] < len(slab)
    assert seen["pbc"] == [True, True, True]
    assert seen["cell"] == pytest.approx(slab.get_cell().array.flatten().tolist())


def test_render_select_matching_nothing_is_a_clean_error(runner, monkeypatch, tmp_path):
    import app.cli as cli_mod
    import app.services.render_browser as rb

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", lambda **k: pytest.fail("driver must not run"))

    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, ["render", str(WATER), "-o", out, "--select", "elem:Xe", "--no-build"])
    assert r.exit_code != 0
    assert "0 atoms" in r.output
    assert "Traceback" not in r.output


def test_render_rejects_a_malformed_selection_cleanly(runner, monkeypatch, tmp_path):
    import app.cli as cli_mod
    import app.services.render_browser as rb

    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(rb, "render_structure", lambda **k: pytest.fail("driver must not run"))

    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, ["render", str(WATER), "-o", out, "--select", "elem:", "--no-build"])
    assert r.exit_code != 0
    assert "Traceback" not in r.output


def test_render_without_select_passes_the_original_path(runner, monkeypatch, tmp_path):
    import app.cli as cli_mod
    import app.services.render_browser as rb

    seen = {}
    monkeypatch.setattr(cli_mod, "_ensure_frontend_bundle", lambda *a, **k: None)
    monkeypatch.setattr(
        rb, "render_structure",
        lambda **k: seen.update(path=k["structure_path"]) or {"png": k.get("out_png"), "glb": None, "n_atoms": 3},
    )

    out = str(tmp_path / "x.png")
    r = runner.invoke(cli, ["render", str(WATER), "-o", out, "--no-build"])
    assert r.exit_code == 0, r.output
    assert seen["path"] == str(WATER)


@pytest.mark.skipif(
    os.environ.get("ATOMCANVAS_RENDER_E2E") != "1",
    reason="browser render is opt-in; set ATOMCANVAS_RENDER_E2E=1 (needs playwright+chromium+built bundle)",
)
def test_render_water_produces_png(runner, tmp_path):
    pytest.importorskip("playwright")
    out = tmp_path / "water.png"
    result = runner.invoke(cli, ["render", str(WATER), "-o", str(out), "--size", "640x480"])
    assert result.exit_code == 0, result.output
    assert out.is_file()
    assert out.stat().st_size > 2000  # a real, non-blank PNG
