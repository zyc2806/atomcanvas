from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/")
def read_root():
    return {"message": "Welcome to the AtomCanvas Backend"}
