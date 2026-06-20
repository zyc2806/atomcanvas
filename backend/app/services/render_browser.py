"""Headless render driver: serve the app, drive window.__atomcanvas in Chromium,
capture pixel-accurate PNG / glb. Playwright is imported lazily so importing this
module (and the whole CLI) never requires the optional dependency."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from ase.io import read

from .render_support import (
    base64_to_bytes,
    build_style_calls,
    data_url_to_bytes,
    find_free_port,
)


class RenderDependencyError(Exception):
    """Raised when the optional `playwright` dependency is missing."""


def _require_playwright():
    try:
        from playwright.sync_api import sync_playwright  # noqa: WPS433 (lazy by design)
    except ImportError as exc:  # pragma: no cover - exercised only without the extra
        raise RenderDependencyError(
            'Headless render needs Playwright. Install it with: '
            'pip install "atomcanvas[render]" && playwright install chromium'
        ) from exc
    return sync_playwright


def _start_server(host: str, port: int):
    """Start uvicorn(app.main:app) in a daemon thread; return (server, thread)."""
    import uvicorn

    config = uvicorn.Config("app.main:app", host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 30
    while not server.started:
        if time.time() > deadline:
            raise RuntimeError("uvicorn did not start within 30s")
        time.sleep(0.05)
    return server, thread


def render_structure(
    *,
    structure_path: str,
    out_png: str | None,
    out_glb: str | None,
    size: tuple[int, int] = (1600, 1000),
    scale: int = 1,
    display: str | None = None,
    render_style: str | None = None,
    transparent: bool = False,
    background: str | None = None,
    scene: str | None = None,
    host: str = "127.0.0.1",
    timeout_s: float = 60.0,
) -> dict:
    sync_playwright = _require_playwright()  # raises RenderDependencyError if absent

    n_atoms = len(read(structure_path))  # validate the structure up front (clean error)
    scene_doc = json.loads(Path(scene).read_text()) if scene else None
    width, height = size
    port = find_free_port(host)
    url = f"http://{host}:{port}/"

    server, thread = _start_server(host, port)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--no-proxy-server", "--proxy-bypass-list=*"])
            try:
                page = browser.new_page(viewport={"width": width, "height": height})
                page.set_default_timeout(timeout_s * 1000)
                page.goto(url)
                page.wait_for_function("() => !!window.__atomcanvas")

                # Load via the real file input (faithful app path).
                page.set_input_files("[data-testid=file-input]", structure_path)
                page.wait_for_function(
                    "() => { const s = window.__atomcanvas.getState();"
                    " return !!s.structureData && !s.loading; }"
                )

                # Apply optional scene preset, then style overrides.
                if scene_doc is not None:
                    page.evaluate("(d) => window.__atomcanvas.applyScene(d)", scene_doc)
                for method, arg in build_style_calls(
                    display=display, render_style=render_style,
                    transparent=transparent, background=background,
                ):
                    page.evaluate(f"(a) => window.__atomcanvas.{method}(a)", arg)

                # Wait for real frames, then force one more render before capture.
                start_frames = page.evaluate("() => window.__atomcanvas.frames()")
                page.wait_for_function(
                    "(n) => window.__atomcanvas.frames() > n + 2", arg=start_frames
                )
                page.evaluate("() => window.__atomcanvas.forceRender()")

                result: dict = {"png": None, "glb": None, "n_atoms": n_atoms}
                if out_png:
                    data_url = page.evaluate("(s) => window.__atomcanvas.capturePng(s)", scale)
                    if not data_url:
                        raise RuntimeError("capturePng returned nothing (no canvas?)")
                    Path(out_png).write_bytes(data_url_to_bytes(data_url))
                    result["png"] = str(Path(out_png).resolve())
                if out_glb:
                    b64 = page.evaluate("async () => await window.__atomcanvas.exportGlbBase64()")
                    if not b64:
                        raise RuntimeError("exportGlbBase64 returned nothing (no structure?)")
                    Path(out_glb).write_bytes(base64_to_bytes(b64))
                    result["glb"] = str(Path(out_glb).resolve())
                return result
            finally:
                browser.close()
    finally:
        server.should_exit = True
        thread.join(timeout=10)
