"""AtomCanvas headless CLI — the scriptable chemistry core.

Wraps the pure service layer (no FastAPI, no browser) so the bonding /
selection / export logic that powers the web app is usable from a shell or a
pipeline:

    atomcanvas info     structure.cif
    atomcanvas bonds    structure.cif --mode full --json
    atomcanvas select   structure.cif "elem:C AND pos:z>10"
    atomcanvas select   structure.cif "elem:C" --ast
    atomcanvas convert  POSCAR out.cif
    atomcanvas convert  POSCAR carbons.xyz --select "elem:C"

Run as ``atomcanvas`` (installed console script) or ``python -m app.cli``.

Note: the *visual* exports (PNG screenshot, glb model) are browser-only and are
intentionally not exposed here — they depend on the live WebGL canvas.
"""

from __future__ import annotations

import json
from pathlib import Path

import click
from ase import Atoms
from ase.io import read

from .services.bond_override_ops import create_bond_override, delete_bond_overrides
from .services.building_ops import build_supercell_atoms
from .services.editing_ops import translate_structure_in_atoms
from .services.export_ops import export_atoms_to_file
from .services.geometry import get_bonds_and_ghosts, calc_h_bond_geometries
from .services.selection_parser import parse_selection_expression, get_selection_ast

# Map output extensions to the registry format name passed to export_atoms_to_file.
# The export service resolves each name to the correct ase.io.write format string
# (e.g. 'pdb' -> 'proteindatabank') via resolve_ase_write_format, so the registry
# name is what goes here — not the ASE internal name.
# VASP output needs a '.vasp' extension (the export service rejects extensionless
# paths like POSCAR).  '.mol' is deliberately absent because ASE has no mol writer.
_EXT_TO_FORMAT = {
    ".cif": "cif",
    ".xyz": "xyz",
    ".extxyz": "extxyz",
    ".vasp": "vasp",
    ".traj": "traj",
    ".pdb": "pdb",
}


def _read_atoms(path: str) -> Atoms:
    try:
        return read(path)
    except click.ClickException:
        raise
    except Exception as exc:  # ASE raises a grab-bag of errors; keep it clean.
        raise click.ClickException(f"Could not read '{path}': {exc}")


def _infer_format(out: Path, explicit: str | None) -> str:
    if explicit:
        return explicit.strip().lower()
    suffix = out.suffix.lower()
    if suffix in _EXT_TO_FORMAT:
        return _EXT_TO_FORMAT[suffix]
    raise click.ClickException(
        f"Cannot infer a format from '{out.name}'. Pass --format "
        f"(one of: {', '.join(sorted(set(_EXT_TO_FORMAT.values())))})."
    )


def _native_bonds(bonds) -> list[list[float]]:
    """Coerce service output (which may carry numpy scalars) to JSON-safe values."""
    return [[int(i), int(j), float(order)] for i, j, order in bonds]


def _plan_frontend(
    static_index_exists: bool,
    do_build: bool,
    frontend_exists: bool,
    npm_path: str | None,
) -> tuple[str, str | None]:
    """Decide how ``serve`` should obtain the built SPA before launching uvicorn.

    Returns ``('ready', None)`` when the bundle is already staged, ``('build',
    None)`` when it should be built with npm, or ``('error', message)`` when it
    cannot proceed. Pure (no I/O) so the branching is unit-testable.
    """
    if static_index_exists:
        return ("ready", None)
    if not do_build or not frontend_exists:
        return (
            "error",
            "Frontend bundle not found at backend/static/index.html. Build it with "
            "`npm --prefix frontend run build` (Node 22) and re-run, run `atomcanvas "
            "serve` from a source checkout so it can build, or use Docker.",
        )
    if npm_path is None:
        return (
            "error",
            "Frontend bundle is missing and `npm` was not found on PATH. Install "
            "Node 22 (see frontend/.nvmrc) and re-run, or use Docker.",
        )
    return ("build", None)


@click.group(help="AtomCanvas headless tools: bonding, selection, and structure export.")
@click.version_option("0.1.0", message="%(version)s")
def cli() -> None:
    pass


@cli.command(help="Report formula, atom count, periodicity, and cell.")
@click.argument("path", type=click.Path())
def info(path: str) -> None:
    atoms = _read_atoms(path)
    cell = atoms.get_cell()
    has_cell = bool(atoms.cell.rank)
    click.echo(f"formula: {atoms.get_chemical_formula()}")
    click.echo(f"atoms:   {len(atoms)}")
    click.echo(f"pbc:     {atoms.pbc.tolist()}")
    if has_cell:
        lengths = ", ".join(f"{v:.3f}" for v in atoms.cell.lengths())
        click.echo(f"cell:    lengths ({lengths})")
    else:
        click.echo("cell:    none")


@cli.command(help="Detect bonds, bond orders, and aromatic rings.")
@click.argument("path", type=click.Path())
@click.option("--bond-scale", default=1.2, show_default=True, help="Covalent-radius scale for bond detection.")
@click.option(
    "--mode",
    type=click.Choice(["auto", "quick", "full"]),
    default="auto",
    show_default=True,
    help="Bond-order inference mode.",
)
@click.option("--json", "as_json", is_flag=True, help="Emit machine-readable JSON.")
def bonds(path: str, bond_scale: float, mode: str, as_json: bool) -> None:
    atoms = _read_atoms(path)
    try:
        detected, ghost_bonds, rings = get_bonds_and_ghosts(
            atoms, bond_scale=bond_scale, bond_inference_mode=mode
        )
    except click.ClickException:
        raise
    except Exception as exc:
        raise click.ClickException(f"Bond detection failed: {exc}")

    bond_list = _native_bonds(detected)
    symbols = atoms.get_chemical_symbols()

    if as_json:
        payload = {
            "formula": atoms.get_chemical_formula(),
            "n_atoms": len(atoms),
            "bonds": bond_list,
            "rings": len(rings),
            "ghost_bonds": len(ghost_bonds),
        }
        click.echo(json.dumps(payload, indent=2))
        return

    click.echo(
        f"{atoms.get_chemical_formula()} — {len(atoms)} atoms, "
        f"{len(bond_list)} bonds, {len(rings)} rings"
    )
    for i, j, order in bond_list:
        click.echo(f"  {i}-{j}  {symbols[i]}-{symbols[j]}  order {order:g}")


@cli.command(help='Evaluate a selection DSL expression, e.g. "elem:C AND pos:z>10".')
@click.argument("path", type=click.Path())
@click.argument("expression")
@click.option("--bond-scale", default=1.2, show_default=True, help="Bond scale used by bonded/connected selectors.")
@click.option("--ast", "as_ast", is_flag=True, help="Print the parsed expression AST instead of evaluating it.")
def select(path: str, expression: str, bond_scale: float, as_ast: bool) -> None:
    if as_ast:
        try:
            ast = get_selection_ast(expression)
        except Exception as exc:
            raise click.ClickException(f"Parse failed: {exc}")
        click.echo(json.dumps(ast, indent=2))
        return
    atoms = _read_atoms(path)
    try:
        indices = parse_selection_expression(atoms, expression, bond_scale=bond_scale)
    except click.ClickException:
        raise
    except Exception as exc:
        raise click.ClickException(f"Selection failed: {exc}")
    click.echo(json.dumps(sorted(int(i) for i in indices)))


@cli.command(help="Re-export the structure to another file format (CIF/XYZ/extXYZ/VASP/traj).")
@click.argument("input_path", type=click.Path())
@click.argument("output_path", type=click.Path())
@click.option("--format", "fmt", default=None, help="ASE format name (inferred from the output extension if omitted).")
@click.option("--select", "selection", default=None, help='Export only atoms matching a selection DSL expression, e.g. "elem:C".')
@click.option("--bond-scale", default=1.2, show_default=True, help="Bond scale for bonded/connected selectors used by --select.")
def convert(input_path: str, output_path: str, fmt: str | None, selection: str | None, bond_scale: float) -> None:
    atoms = _read_atoms(input_path)
    if selection is not None:
        try:
            idx = parse_selection_expression(atoms, selection, bond_scale=bond_scale)
        except Exception as exc:
            raise click.ClickException(f"Selection failed: {exc}")
        idx = sorted(int(i) for i in idx)
        if not idx:
            raise click.ClickException("selection matched 0 atoms")
        atoms = atoms[idx]
    out = Path(output_path)
    format_name = _infer_format(out, fmt)
    try:
        result = export_atoms_to_file(
            images=[atoms],
            output_path=out,
            format_name=format_name,
            scope="current_frame",
        )
    except click.ClickException:
        raise
    except Exception as exc:
        raise click.ClickException(str(exc))
    frames = result.exported_frames
    click.echo(
        f"wrote {result.output_path} ({result.format_name}, "
        f"{frames} frame{'s' if frames != 1 else ''})"
    )


@cli.command(help="Build a supercell by repeating the cell along a/b/c.")
@click.argument("input_path", type=click.Path())
@click.argument("output_path", type=click.Path())
@click.option("--reps", nargs=3, type=int, required=True, help="Repetitions: NX NY NZ.")
@click.option("--format", "fmt", default=None, help="Output format (inferred from extension if omitted).")
def supercell(input_path: str, output_path: str, reps, fmt: str | None) -> None:
    atoms = _read_atoms(input_path)
    try:
        out_atoms = build_supercell_atoms(atoms, list(reps))
    except Exception as exc:
        raise click.ClickException(str(exc))
    out = Path(output_path)
    result = export_atoms_to_file(
        images=[out_atoms], output_path=out, format_name=_infer_format(out, fmt), scope="current_frame"
    )
    click.echo(f"wrote {result.output_path} ({len(out_atoms)} atoms)")


@cli.command(help="Translate all atoms by a vector (cartesian or lattice units).")
@click.argument("input_path", type=click.Path())
@click.argument("output_path", type=click.Path())
@click.option("--vector", nargs=3, type=float, required=True, help="Translation: X Y Z.")
@click.option("--type", "vector_type", type=click.Choice(["cartesian", "lattice"]), default="cartesian", show_default=True)
@click.option("--wrap/--no-wrap", default=False, show_default=True, help="Wrap atoms back into the cell.")
@click.option("--format", "fmt", default=None, help="Output format (inferred from extension if omitted).")
def translate(input_path, output_path, vector, vector_type, wrap, fmt):
    atoms = _read_atoms(input_path)
    try:
        out_atoms = translate_structure_in_atoms(atoms, list(vector), vector_type, wrap)
    except Exception as exc:
        raise click.ClickException(f"Translate failed: {exc}")
    out = Path(output_path)
    result = export_atoms_to_file(
        images=[out_atoms], output_path=out, format_name=_infer_format(out, fmt), scope="current_frame"
    )
    click.echo(f"wrote {result.output_path} ({len(out_atoms)} atoms)")


@cli.command(help="Apply manual bond overrides (create/delete) and report the resulting bonds.")
@click.argument("path", type=click.Path())
@click.option("--create", "create_pairs", nargs=2, type=int, multiple=True, metavar="I J", help="Force a bond between atoms I and J (repeatable).")
@click.option("--delete", "delete_pairs", nargs=2, type=int, multiple=True, metavar="I J", help="Delete the bond between atoms I and J (repeatable).")
@click.option("--bond-scale", default=1.2, show_default=True, help="Covalent-radius scale for base bond detection.")
@click.option("--json", "as_json", is_flag=True, help="Emit machine-readable JSON.")
def bond(path, create_pairs, delete_pairs, bond_scale, as_json):
    atoms = _read_atoms(path)
    overrides: dict[str, str] = {}
    try:
        for i, j in create_pairs:
            overrides = create_bond_override(atoms, f"{i}-{j}", overrides)
        if delete_pairs:
            overrides = delete_bond_overrides(atoms, [f"{i}-{j}" for i, j in delete_pairs], overrides)
        detected, _ghosts, rings = get_bonds_and_ghosts(atoms, bond_scale=bond_scale, bond_overrides=overrides)
    except click.ClickException:
        raise
    except Exception as exc:
        raise click.ClickException(f"Bond override failed: {exc}")
    bond_list = _native_bonds(detected)
    if as_json:
        click.echo(json.dumps({"bonds": bond_list, "overrides": overrides, "rings": len(rings)}, indent=2))
        return
    symbols = atoms.get_chemical_symbols()
    click.echo(f"{len(bond_list)} bonds after overrides ({len(overrides)} override(s))")
    for i, j, order in bond_list:
        click.echo(f"  {i}-{j}  {symbols[i]}-{symbols[j]}  order {order:g}")


@cli.command(help="Detect hydrogen bonds (donor–H···acceptor) and report the count.")
@click.argument("path", type=click.Path())
@click.option("--distance", default=3.5, show_default=True, help="Donor–acceptor distance cutoff (Å).")
@click.option("--angle", default=120.0, show_default=True, help="Minimum D–H···A angle (degrees).")
@click.option("--json", "as_json", is_flag=True, help="Emit machine-readable JSON.")
def hbonds(path, distance, angle, as_json):
    atoms = _read_atoms(path)
    try:
        wrapped, _unwrapped = calc_h_bond_geometries(atoms, distance_cutoff=distance, angle_cutoff=angle)
    except Exception as exc:
        raise click.ClickException(f"H-bond detection failed: {exc}")
    count = len(wrapped)
    if as_json:
        click.echo(json.dumps({"formula": atoms.get_chemical_formula(), "h_bonds": count,
                               "distance_cutoff": distance, "angle_cutoff": angle}, indent=2))
        return
    click.echo(f"{atoms.get_chemical_formula()} — {count} hydrogen bond(s)")


def _ensure_frontend_bundle(backend_dir: Path, do_build: bool) -> None:
    """Make sure backend/static/index.html exists; build via npm if allowed."""
    import shutil
    import subprocess

    repo_root = backend_dir.parent
    static_dir = backend_dir / "static"
    static_index = static_dir / "index.html"
    frontend_dir = repo_root / "frontend"

    action, message = _plan_frontend(
        static_index.is_file(), do_build, frontend_dir.is_dir(), shutil.which("npm")
    )
    if action == "error":
        raise click.ClickException(message)
    if action == "ready":
        return
    click.echo("Frontend bundle missing — building it with npm (first run)...")
    npm = shutil.which("npm")
    try:
        if not (frontend_dir / "node_modules").is_dir():
            subprocess.run([npm, "install"], cwd=frontend_dir, check=True)
        subprocess.run([npm, "run", "build"], cwd=frontend_dir, check=True)
    except subprocess.CalledProcessError as exc:
        raise click.ClickException(f"Frontend build failed: {exc}")
    dist_dir = frontend_dir / "dist"
    if not (dist_dir / "index.html").is_file():
        raise click.ClickException("Frontend build did not produce dist/index.html.")
    if static_dir.exists():
        shutil.rmtree(static_dir)
    shutil.copytree(dist_dir, static_dir)


@cli.command(
    help=(
        "Serve the web app (API + built SPA) on one port. Cross-platform — no "
        "bash needed, so it works on Windows too. Run from a source checkout "
        "(or an editable `pip install -e .`)."
    )
)
@click.option("--host", default="127.0.0.1", envvar="ATOMCANVAS_HOST", show_default=True, help="Interface to bind.")
@click.option("--port", default=8000, type=int, envvar="ATOMCANVAS_PORT", show_default=True, help="Port to bind.")
@click.option(
    "--build/--no-build",
    "do_build",
    default=True,
    show_default=True,
    help="Build the frontend with npm if the bundle is missing (needs Node 22).",
)
@click.option("--reload", "use_reload", is_flag=True, help="Auto-reload the backend on code changes (development).")
def serve(host: str, port: int, do_build: bool, use_reload: bool) -> None:
    backend_dir = Path(__file__).resolve().parent.parent  # .../backend
    _ensure_frontend_bundle(backend_dir, do_build)
    import uvicorn
    click.echo(f"🚀 AtomCanvas (API + SPA) on http://{host}:{port}")
    uvicorn.run("app.main:app", host=host, port=port, reload=use_reload, app_dir=str(backend_dir))


@cli.command(
    help=(
        "Render a structure to a pixel-accurate PNG/glb by driving the real "
        "viewer headlessly (needs the optional extra: pip install "
        '"atomcanvas[render]" && playwright install chromium).'
    )
)
@click.argument("structure", type=click.Path(exists=True, dir_okay=False))
@click.option("-o", "--output", "out_png", type=click.Path(), default=None, help="Output PNG path.")
@click.option("--glb", "out_glb", type=click.Path(), default=None, help="Also export a .glb model.")
@click.option("--size", default="1600x1000", show_default=True, help="Viewport size WxH.")
@click.option("--scale", default=1, type=int, show_default=True, help="PNG supersample factor.")
@click.option("--display", type=click.Choice(["ball-stick", "vdw", "wireframe"]), default=None, help="Display mode.")
@click.option("--style", "render_style", type=click.Choice(["soft", "cartoon", "standard"]), default=None, help="Render style.")
@click.option("--transparent", is_flag=True, help="Transparent background.")
@click.option("--background", default=None, help="Solid background color, e.g. '#ffffff'.")
@click.option("--brightness", type=click.FloatRange(0.0, 2.0), default=None, help="Global brightness multiplier (0.0–2.0; 1.0 = default, 2.0 = max).")
@click.option("--camera", type=click.Choice(["perspective", "orthographic"]), default=None, help="Camera projection (default: the viewer's perspective).")
@click.option("--scene", type=click.Path(exists=True, dir_okay=False), default=None, help="Apply a saved scene.json (bakes edits+style+camera).")
@click.option("--no-gizmo", "no_gizmo", is_flag=True, help="Hide the XYZ axes gizmo (cleaner figure output).")
@click.option("--no-build", "do_build", flag_value=False, default=True, help="Do not auto-build the frontend bundle.")
def render(structure, out_png, out_glb, size, scale, display, render_style, transparent, background, brightness, camera, scene, no_gizmo, do_build):
    from .services import render_browser
    from .services.render_support import parse_size

    if not out_png and not out_glb:
        raise click.ClickException("Nothing to render: pass -o/--output FILE.png and/or --glb FILE.glb.")
    try:
        parsed_size = parse_size(size)
    except ValueError as exc:
        raise click.ClickException(str(exc))

    backend_dir = Path(__file__).resolve().parent.parent
    _ensure_frontend_bundle(backend_dir, do_build)

    try:
        result = render_browser.render_structure(
            structure_path=structure, out_png=out_png, out_glb=out_glb,
            size=parsed_size, scale=scale, display=display, render_style=render_style,
            transparent=transparent, background=background, brightness=brightness,
            camera=camera, scene=scene, hide_gizmo=no_gizmo,
        )
    except render_browser.RenderDependencyError as exc:
        raise click.ClickException(str(exc))
    except Exception as exc:
        raise click.ClickException(f"Render failed: {exc}")

    if result.get("png"):
        click.echo(f"wrote {result['png']} ({result['n_atoms']} atoms)")
    if result.get("glb"):
        click.echo(f"wrote {result['glb']}")


if __name__ == "__main__":
    cli()
