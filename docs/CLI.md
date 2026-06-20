# Command-line interface

The chemistry core — parsing, bond / order / ring detection, the selection DSL,
and structure-file export — is scriptable without the browser. Even the *visual*
exports (PNG screenshot, `.glb` model) are scriptable via `render`, which drives
the real viewer headlessly (optional `[render]` extra — see below).

## Invocation

From a source checkout, run it uninstalled:

```bash
cd backend
python -m app.cli --help
```

Or install the package to get an `atomcanvas` console script:

```bash
cd backend
pip install .          # installs the backend + the `atomcanvas` CLI
atomcanvas --help
```

> Install into an **isolated virtualenv**: the import package is the generic name
> `app`, so a system-wide install would shadow anything else named `app`. Or skip
> installing and use `python -m app.cli` as shown above.

The examples below use `python -m app.cli`; substitute `atomcanvas` if you
installed it.

### Optional `[render]` extra

The `render` command drives a real Chromium browser headlessly via Playwright.
Install the extra and the browser once:

```bash
pip install "atomcanvas[render]"
playwright install chromium
```

## Commands

### `info` — structure summary

```bash
python -m app.cli info ../fixtures/water.xyz
```

Prints the chemical formula, atom count, periodicity (`pbc`), and cell lengths
(or `none` for a non-periodic structure).

### `bonds` — bond / order / ring detection

```bash
python -m app.cli bonds ../fixtures/water.xyz
python -m app.cli bonds ../fixtures/water.xyz --mode full --json
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--bond-scale` | `1.2` | Covalent-radius scale for bond detection. |
| `--mode` | `auto` | Bond-order inference: `auto` / `quick` / `full`. |
| `--json` | off | Emit machine-readable JSON (`formula`, `n_atoms`, `bonds`, `rings`, `ghost_bonds`). |

The default (human-readable) output lists each bond as `i-j  Sym-Sym  order N`.

### `select` — evaluate a selection expression

```bash
python -m app.cli select ../fixtures/water.xyz "elem:O"
python -m app.cli select ../fixtures/water.xyz "elem:C AND pos:z>10"
python -m app.cli select ../fixtures/water.xyz "elem:C" --ast
```

Prints a JSON array of the matching zero-based atom indices. See the
[Selection DSL](#selection-dsl) below for the grammar.

| Option | Default | Meaning |
| --- | --- | --- |
| `--bond-scale` | `1.2` | Bond scale used by the `bonded:` / `connected:` / `extend:` selectors. |
| `--ast` | off | Print the parsed expression AST instead of evaluating it. |

### `convert` — re-export to another file format

```bash
python -m app.cli convert ../fixtures/water.xyz out.cif
python -m app.cli convert POSCAR carbons.xyz --select "elem:C"
```

Writes the structure to another format, optionally exporting only the atoms that
match a selection expression.

| Option | Default | Meaning |
| --- | --- | --- |
| `--format` | *(inferred)* | ASE format name. Inferred from the output extension if omitted. |
| `--select` | *(none)* | Export only atoms matching a selection DSL expression. |
| `--bond-scale` | `1.2` | Bond scale for `bonded:` / `connected:` selectors used by `--select`. |

Supported output extensions: `.cif`, `.xyz`, `.extxyz`, `.vasp`, `.traj`,
`.pdb`. The output **must** carry an extension — VASP output, in particular,
needs `.vasp` (an extensionless `POSCAR` is rejected). Pass `--format` to
override the inferred format.

### `serve` — run the web app

```bash
python -m app.cli serve              # builds the SPA if needed, then serves :8000
atomcanvas serve --host 0.0.0.0 --port 9000
```

The cross-platform single-port server (no bash needed). See
[RUN.md → Option 3](RUN.md#option-3--atomcanvas-serve-cross-platform-no-bash)
for details and flags (`--host` / `--port` / `--build/--no-build` / `--reload`).

### `supercell` — build a supercell

Repeat the unit cell along a/b/c. **Requires a structure with a defined unit cell**
(e.g. CIF, extXYZ with `Lattice=`, VASP POSCAR).

```bash
python -m app.cli supercell INPUT OUTPUT --reps NX NY NZ [--format NAME]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--reps` | *(required)* | Three integers — repetitions along a, b, c. |
| `--format` | *(inferred)* | Output format; inferred from the extension if omitted. |

Example:

```bash
python -m app.cli supercell ../fixtures/nacl.cif /tmp/nacl_2x2x2.cif --reps 2 2 2
```

### `translate` — shift all atoms by a vector

Translate every atom by a Cartesian or fractional vector.

```bash
python -m app.cli translate INPUT OUTPUT --vector X Y Z [--type cartesian|lattice] [--wrap] [--format NAME]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--vector` | *(required)* | Translation vector: three floats `X Y Z`. |
| `--type` | `cartesian` | Interpret the vector as Cartesian (Å) or fractional lattice coordinates. |
| `--wrap` / `--no-wrap` | `--no-wrap` | Wrap atoms back into the cell after translation. |
| `--format` | *(inferred)* | Output format; inferred from the extension if omitted. |

Example:

```bash
python -m app.cli translate ../fixtures/water.xyz /tmp/shifted.xyz --vector 1 0 0
```

### `bond` — apply manual bond overrides

Create or delete specific bonds and report the resulting bond list.

```bash
python -m app.cli bond INPUT [--create I J] [--delete I J] [--bond-scale 1.2] [--json]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--create I J` | none | Force a bond between atoms I and J (repeatable). |
| `--delete I J` | none | Delete the bond between atoms I and J (repeatable). |
| `--bond-scale` | `1.2` | Covalent-radius scale for base bond detection. |
| `--json` | off | Machine-readable JSON output. |

Example — delete the bond between atoms 0 and 1:

```bash
python -m app.cli bond ../fixtures/water.xyz --delete 0 1
```

### `hbonds` — detect hydrogen bonds

Report donor–H···acceptor hydrogen bonds with a configurable distance and angle cutoff.

```bash
python -m app.cli hbonds INPUT [--distance Å] [--angle DEG] [--json]
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--distance` | `3.5` | Donor–acceptor distance cutoff (Å). |
| `--angle` | `120.0` | Minimum D–H···A angle (degrees). |
| `--json` | off | Machine-readable JSON output. |

Example:

```bash
python -m app.cli hbonds ../fixtures/water.xyz
```

### `render` — headless figure / glb export

Render a structure to a pixel-accurate PNG and/or `.glb` by driving the real
viewer headlessly via Playwright. **Requires the `[render]` extra** (see
[Optional `[render]` extra](#optional-render-extra) above).

```bash
python -m app.cli render STRUCTURE [-o OUTPUT.png] [--glb OUTPUT.glb] [OPTIONS]
```

At least one of `-o` / `--glb` is required.

| Option | Default | Meaning |
| --- | --- | --- |
| `-o, --output PATH` | none | Output PNG path. |
| `--glb PATH` | none | Also export a `.glb` 3D model. |
| `--size WxH` | `1600x1000` | Viewport size in pixels. |
| `--scale INTEGER` | `1` | PNG supersample factor. |
| `--display` | none | Display mode: `ball-stick`, `vdw`, or `wireframe`. |
| `--style` | none | Render style: `soft`, `cartoon`, or `standard`. |
| `--transparent` | off | Transparent background. |
| `--background TEXT` | none | Solid background color, e.g. `'#ffffff'`. |
| `--scene FILE` | none | Apply a saved `scene.json` (bakes edits + style + camera). |
| `--no-gizmo` | off | Hide the XYZ axes gizmo for a clean figure. |
| `--no-build` | *(builds if needed)* | Skip auto-building the frontend bundle. |

Examples:

```bash
# PNG with custom display and viewport size
python -m app.cli render ../fixtures/water.xyz -o water.png --display vdw --size 1200x900

# Cartoon style with transparent background
python -m app.cli render mol.cif -o mol.png --style cartoon --transparent

# Headless glb export only
python -m app.cli render mol.cif --glb mol.glb

# Reproducible figure from a saved scene
python -m app.cli render mol.cif -o fig.png --scene saved.scene.json
```

## Selection DSL

The same expression language powers `select`, `convert --select`, and the
in-app **Expression (advanced)** field. Selectors return a set of atom indices;
combine them with boolean logic.

### Selectors

| Selector | Example | Selects |
| --- | --- | --- |
| `elem:` | `elem:C` | Atoms of an element symbol. |
| `label:` | `label:C1` or `label:0,1,2` | Atoms by label or index. |
| `pos:` | `pos:z>5.0` | Cartesian-coordinate filter on an axis. |
| `frac:` | `frac:z>0.5` | Fractional-coordinate filter on an axis. |
| `slab:` | `slab:z@2` | A layer index from slab analysis. |
| `sphere:` | `sphere:@0;3.5` | Atoms within a radius (Å) of a target atom. |
| `bonded:` | `bonded:@0` | Atoms directly bonded to a target. |
| `connected:` | `connected:@0` | The entire fragment connected to a target. |
| `pct:` | `pct:z;0;50` | A percentile band along an axis (here the bottom 50%). |
| `extend:` | `extend:@0;2` | Grow a selection N bond hops outward. |
| `ids:` | `ids:0,1,5` | Explicit atom indices. |
| `fixed` | `fixed` | Atoms frozen in place (a `FixAtoms` constraint). |
| `pin(…)` | `pin(elem:C)` | Pin a sub-expression so it stays fixed during editing. |
| `*` | `*` | All atoms in the structure. |

### Operators and grouping

| Token | Meaning |
| --- | --- |
| `AND` / `OR` / `NOT` | Boolean logic — combine or negate selectors. |
| `( )` | Grouping parentheses — control evaluation order, e.g. `(elem:C OR elem:N)`. |

### Grammar conventions

| Token | Meaning |
| --- | --- |
| `@index` | Target an atom by zero-based index — e.g. `@0`, `@3`. |
| `;hops` | A number of bond hops — e.g. `extend:@0;2` means 2 hops out. |
| `,` | Separates multiple values or targets — e.g. `ids:0,1,5`. |

### Examples

```text
elem:O                      all oxygen atoms
elem:C AND pos:z>10         carbons above z = 10 Å
NOT (elem:H OR elem:C)      everything that is neither H nor C
connected:@0                the molecule/fragment containing atom 0
extend:@0;2                 atom 0 plus everything within 2 bond hops
frac:z>0.5 AND NOT fixed    upper-half atoms that are not frozen
```
