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
