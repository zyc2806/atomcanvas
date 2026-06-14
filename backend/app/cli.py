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

from .services.export_ops import export_atoms_to_file
from .services.geometry import get_bonds_and_ghosts
from .services.selection_parser import parse_selection_expression, get_selection_ast

# Map output extensions to the ASE format passed to write. Only formats the
# export pipeline can actually round-trip are listed: PDB is deliberately absent
# because the capability registry keys it 'pdb' while ase.io.write only accepts
# 'proteindatabank', so neither spelling writes successfully. VASP output needs a
# '.vasp' extension (the export service rejects extensionless paths like POSCAR).
_EXT_TO_FORMAT = {
    ".cif": "cif",
    ".xyz": "xyz",
    ".extxyz": "extxyz",
    ".vasp": "vasp",
    ".traj": "traj",
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


if __name__ == "__main__":
    cli()
