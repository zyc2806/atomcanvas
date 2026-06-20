# Gallery

A visual tour of what AtomCanvas renders. AtomCanvas is a *visualization* app, so
these are the whole point.

## Molecules & crystals

<table>
  <tr>
    <td align="center" width="50%">
      <img src="assets/gallery/molecule.png" alt="Organic molecule with aromatic rings and bond orders" width="100%">
      <br><sub>Aromatic rings + RDKit-perceived bond orders</sub>
    </td>
    <td align="center" width="50%">
      <img src="assets/gallery/crystal.png" alt="Crystal with unit cell and PBC ghost bonds" width="100%">
      <br><sub>Unit cell + PBC cross-boundary (ghost) bonds</sub>
    </td>
  </tr>
</table>

## Surfaces & trajectories

<table>
  <tr>
    <td align="center" width="50%">
      <img src="assets/gallery/slab.png" alt="Surface slab with visible layers" width="100%">
      <br><sub>Layered surface slab</sub>
    </td>
    <td align="center" width="50%">
      <img src="assets/gallery/trajectory.gif" alt="Trajectory playback — water molecule scrubbing through 10 frames" width="100%">
      <br><sub>Trajectory playback (10-frame ping-pong)</sub>
    </td>
  </tr>
</table>

## Render styles

Three built-in render styles. Standard shows C<sub>60</sub> adsorbed on an
Ag<sub>2</sub>O surface; soft shows a 2D covalent framework; cartoon shows a metal
macrocycle.

<table>
  <tr>
    <td align="center" width="33%">
      <img src="assets/gallery/style-standard.png" alt="Standard ball-and-stick style" width="100%">
      <br><sub>Standard</sub>
    </td>
    <td align="center" width="33%">
      <img src="assets/gallery/style-soft.png" alt="Soft ambient-shaded style" width="100%">
      <br><sub>Soft</sub>
    </td>
    <td align="center" width="33%">
      <img src="assets/gallery/style-cartoon.png" alt="Cartoon toon-shaded style" width="100%">
      <br><sub>Cartoon</sub>
    </td>
  </tr>
</table>

## Exports

<div align="center">
  <img src="assets/gallery/export-figure.png" alt="Exported supersampled PNG figure" width="60%">
  <br><sub>Supersampled PNG figure exported from the viewer</sub>
</div>

Structures also export as `.glb` 3D models that drop straight into a PowerPoint
slide. See [EXPORT.md](EXPORT.md) for the full export reference and the
glb → PowerPoint walkthrough.

## Demo

Upload a structure, rotate it, edit a bond, and open the export menu — in under 20 seconds.

<div align="center">
  <img src="assets/demo.gif" alt="AtomCanvas demo: upload → rotate → edit bond → export" width="80%">
</div>
