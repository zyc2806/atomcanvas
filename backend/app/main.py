from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routers import structure, bonds, selection

app = FastAPI(
    title="AtomCanvas Backend",
    description="Visualization-only backend: parsing, bonding, selection, export.",
    version="0.1.0",
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router prefixes reproduce the original ase-view URLs so the copied tests pass:
#   structure -> /api/structure
#   bonds (extracted from editing.py) -> /api/edit  (internal paths /create_bond, /delete_bonds)
#   selection -> /api  (internal route paths already begin with /selection/...)
app.include_router(structure.router, prefix="/api/structure", tags=["structure"])
app.include_router(bonds.router, prefix="/api/edit", tags=["bonds"])
app.include_router(selection.router, prefix="/api", tags=["selection"])


def mount_frontend(app: FastAPI, dist_dir: Path) -> bool:
    """Serve a built frontend bundle from ``dist_dir`` at ``/`` so a single
    uvicorn process serves both the API and the SPA (one port, one URL).

    Returns True when a bundle was found and mounted, False otherwise. Mounting
    at ``/`` is a catch-all, so it is registered *after* the ``/api/*`` routers
    above — those match first; only unmatched paths fall through to the static
    files. The no-op-without-bundle behavior keeps dev mode working: there the
    Vite dev server serves the SPA and proxies ``/api`` to this backend.
    """
    if not (dist_dir / "index.html").is_file():
        return False
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")
    return True


# `scripts/build.sh` stages the built frontend here. When it is absent we are in
# dev mode and keep a small JSON root instead.
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "static"

if not mount_frontend(app, FRONTEND_DIST):

    @app.get("/")
    def read_root():
        return {"message": "Welcome to the AtomCanvas Backend"}
