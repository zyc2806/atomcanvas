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
| `--brightness FLOAT` | none | Global brightness multiplier, `0.0`–`2.0` (`1.0` = default, `2.0` = max). |
| `--camera` | none | Camera projection: `perspective` or `orthographic`. |
| `--view, --axis SPEC` | none | Fixed viewing direction — see [Choosing a view](#choosing-a-view). |
| `--camera-pos X,Y,Z` | none | Absolute camera position. Wins over `--view`; no framing is applied. |
| `--camera-target X,Y,Z` | *(centroid)* | Look-at point. |
| `--up X,Y,Z` | *(auto)* | Camera up vector. Auto = `+z`, or `+y` when looking along `z`. |
| `--camera-zoom FLOAT` | *(fit)* | Orthographic zoom factor (only meaningful with `--camera orthographic`). |
| `--ball-scale FLOAT` | *(mode preset)* | Atom sphere scale: radius = covalent radius × this. Presets: `0.5` ball-stick, `1.0` vdW. |
| `--no-autoframe` | *(framing on)* | Do not re-centre/re-fit the camera on load. |
| `--no-pbc-bonds` | *(stubs on)* | Hide the half-bond stubs that cross the periodic cell boundary. |
| `--select EXPR` | *(all atoms)* | Render only the atoms matching a [selection expression](#selection-dsl). |
| `--bond-scale FLOAT` | `1.2` | Bond scale for the `bonded:`/`connected:`/`extend:` selectors used by `--select`. |
| `--overrides FILE` | none | Per-atom color/radius overrides, JSON `{"colors":{idx:hex},"radii":{idx:scale}}`. |
| `--scene FILE` | none | Apply a saved `scene.json` (bakes edits + style + camera). |
| `--no-gizmo` | off | Hide the XYZ axes gizmo for a clean figure. |
| `--no-build` | *(builds if needed)* | Skip auto-building the frontend bundle. |

`--camera-target`, `--up` and `--camera-zoom` only refine a placement, so they
require `--view` or `--camera-pos`; on their own they are rejected rather than
silently ignored.

#### Choosing a view

`--view` (spelled `--axis` if you prefer) fixes the direction the camera looks
from, then frames the structure along it. It accepts:

| Form | Example | Meaning |
| --- | --- | --- |
| Named view | `top`, `bottom`, `front`, `back`, `left`, `right`, `side` | Standard world-axis views. `side` is `front`: a slab seen edge-on. |
| Cartesian axis | `z`, `-x` | Along a world axis. |
| Lattice axis | `c`, `-a` | Along a cell vector — the real `a`/`b`/`c`, not merely `x`/`y`/`z`. |
| Lattice direction | `"1 1 1"`, `"1,0,2"` | `h·a + k·b + l·c`. Falls back to a cartesian direction when the structure has no cell. |

The up vector is chosen for you: world `+z`, so a slab keeps its surface normal
upright, falling back to `+y` when you are looking down `z` (where `+z` cannot
serve). `--view top` and `--view z` therefore agree. Override it with `--up`.

Because a view pins the camera explicitly, auto-framing cannot override it —
`--no-autoframe` is not needed alongside `--view`.

> **Periodic structures: prefer `a`/`b`/`c` over the named views.** The named
> views and `x`/`y`/`z` are *cartesian*, so on a non-orthogonal cell (a hexagonal
> slab has γ = 60°) they do not look along a lattice vector. You get an oblique
> projection in which atom columns and cross-boundary stubs overlap confusingly.
> `--view c` looks down the real c axis, so periodic images line up. Reach for
> the named views for molecules and orthogonal cells.

#### Rendering only part of a structure

Looking down `c` at a slab, the top layer hides everything under it, so a
top-down figure says nothing about subsurface composition. `--select` renders a
subset instead — the atoms are filtered *before* the viewer sees them, so bonds,
framing and the exported `.glb` all describe the subset, while the cell and
`pbc` flags are preserved so the cell box and lattice-frame views still work.

```bash
# Top layer only of a 4-layer slab, seen down the c axis
python -m app.cli render alloy.cif -o top.png --axis c --select "slab:z,4,4"

# Top two layers
python -m app.cli render alloy.cif -o top2.png --axis c --select "slab:z,4,3 OR slab:z,4,4"

# Everything above a cartesian height (equivalent to a --slab-range z0:z1 cut)
python -m app.cli render alloy.cif -o top.png --axis c --select "pos:z>12.0"

# The adsorbate and its first coordination shell
python -m app.cli render cfg.cif -o site.png --view side --select "extend:@36;1"
```

The number of atoms kept is reported on stderr; a selection matching nothing is
an error rather than a blank figure.

Examples:

```bash
# PNG with custom display and viewport size
python -m app.cli render ../fixtures/water.xyz -o water.png --display vdw --size 1200x900

# Cartoon style with transparent background
python -m app.cli render mol.cif -o mol.png --style cartoon --transparent

# Headless glb export only
python -m app.cli render mol.cif --glb mol.glb

# Side view of a slab, orthographic — the OVITO-style still
python -m app.cli render slab.cif -o slab.png --view side --camera orthographic

# Look down the c axis; airier spheres for a dense oxide
python -m app.cli render ceo2.cif -o ceo2.png --axis c --ball-scale 0.35

# N structures at the same angle, no GUI and no scene.json needed
for f in *.cif; do
  python -m app.cli render "$f" -o "${f%.cif}.png" --view side --camera orthographic
done

# Fully pinned camera: identical framing regardless of structure size
python -m app.cli render slab.cif -o fig.png \
  --camera-pos 0,-40,10 --camera-target 0,0,6 --no-autoframe

# Reproducible figure from a saved scene
python -m app.cli render mol.cif -o fig.png --scene saved.scene.json
```

## Selection DSL

The same expression language powers `select`, `convert --select`,
`render --select`, and the in-app **Expression (advanced)** field. Selectors
return a set of atom indices; combine them with boolean logic.

### Selectors

| Selector | Example | Selects |
| --- | --- | --- |
| `elem:` | `elem:C` | Atoms of an element symbol. |
| `label:` | `label:C1` or `label:0,1,2` | Atoms by label or index. |
| `pos:` | `pos:z>5.0` | Cartesian-coordinate filter on an axis (`x`/`y`/`z`). |
| `frac:` | `frac:c>0.5` | Fractional-coordinate filter on a **lattice** axis (`a`/`b`/`c`). |
| `slab:` | `slab:z,4,4` | `axis,n_layers,layer` — k-means layer analysis. Layer is 1-based from the **bottom**, so `z,4,4` is the top layer of four. |
| `sphere:` | `sphere:@0,3.5` | Atoms within a radius (Å) of a target atom. |
| `bonded:` | `bonded:@0` | Atoms directly bonded to a target. |
| `connected:` | `connected:@0` | The entire fragment connected to a target. |
| `pct:` | `pct:z,0,50` | A percentile band along an axis (here the bottom 50%). |
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
