# Exporting

AtomCanvas exports figures, 3D models, and portable presets. Most are reached
from the **Export** menu in the top bar; the PNG, `.glb`, and structure exports
also run headlessly from the [CLI](CLI.md).

## Export formats

| Export | What you get |
| --- | --- |
| **PNG (current)** | A PNG snapshot of the current view, captured directly from the WebGL canvas (supersampled for a crisp, publication-ready figure). |
| **glb (current)** | A `.glb` 3D model built from the current structure + styling. |
| **style.json** | The element/atom styling preset (portable, re-importable). |
| **scene.json** | The full scene: styling + camera + scene toggles. |
| **Batch: all tabs → PNG / glb** | One file per open structure tab. |
| **Structure file…** | Re-export the structure itself as CIF, POSCAR (VASP), XYZ, extXYZ, or PDB. |
| **Open scene.json / style.json…** | Import a previously exported preset/scene back into the app. |

For headless structure-file conversion (no browser), see
[CLI.md → `convert`](CLI.md#convert--re-export-to-another-file-format).
For headless PNG and `.glb` export (pixel-accurate, same renderer), see
[CLI.md → `render`](CLI.md#render--headless-figure--glb-export).

## Scene / style documents and `schemaVersion`

`scene.json` and `style.json` each carry a `kind` and a `schemaVersion`.
Importing is all-or-nothing: a document with an unknown `kind`, or a
`schemaVersion` newer than the running app, is rejected rather than silently
misread. This keeps an old build from half-loading a newer document shape.

> **Note on `.glb` vs PNG.** The `.glb` mirrors the *viewport* geometry (atoms,
> bonds with orders, aromatic rings). It deliberately omits ghost / hydrogen
> bonds, the unit cell, and transparency — the PNG export keeps those.

## Inserting a `.glb` into PowerPoint

The exported `.glb` is a standard 3D model. In PowerPoint:

1. Export **glb (current)** and save the `.glb` file.
2. In PowerPoint, go to **Insert → 3D Models → This Device…** and pick the
   `.glb`.
3. The structure appears as a rotatable 3D object — drag the on-model handle to
   spin it, and use **Animations → 3D** (e.g. Turntable) if you want it to rotate
   during the slide.
