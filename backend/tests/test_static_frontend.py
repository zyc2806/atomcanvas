"""Tests for serving the built frontend from the backend (one-process distribution).

`mount_frontend(app, dist_dir)` lets a single uvicorn process serve the SPA at
`/` alongside the `/api/*` routes. It must be a no-op when no bundle is present
so dev mode (Vite proxy) keeps working.
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import mount_frontend


def _app_with_api() -> FastAPI:
    app = FastAPI()

    @app.get("/api/ping")
    def ping():
        return {"pong": True}

    return app


def test_mount_frontend_serves_index_html(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>AtomCanvas</title>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('hi')")

    app = _app_with_api()
    assert mount_frontend(app, tmp_path) is True

    with TestClient(app) as client:
        root = client.get("/")
        assert root.status_code == 200
        assert "AtomCanvas" in root.text

        asset = client.get("/assets/app.js")
        assert asset.status_code == 200
        assert "console.log" in asset.text


def test_api_routes_win_over_static_mount(tmp_path):
    """The SPA mount at `/` must not shadow the API routes registered before it."""
    (tmp_path / "index.html").write_text("<!doctype html><title>spa</title>")

    app = _app_with_api()
    mount_frontend(app, tmp_path)

    with TestClient(app) as client:
        resp = client.get("/api/ping")
        assert resp.status_code == 200
        assert resp.json() == {"pong": True}


def test_mount_frontend_noop_without_bundle(tmp_path):
    app = _app_with_api()
    assert mount_frontend(app, tmp_path) is False
