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
