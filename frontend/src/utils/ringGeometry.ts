/**
 * Shared aromatic-ring torus geometry helpers.
 *
 * The aromatic-ring "donut" is a TorusGeometry whose tube (minor) radius used to
 * be a hardcoded 0.1, disconnected from the bond Radius slider. Both the live
 * viewport (r3f/AromaticRings.tsx) and the glb exporter (services/glbExporter.ts)
 * now derive the tube from the bond radius through this single helper so the two
 * code paths cannot drift.
 */

/** Default bond radius (visParams.bondRadius default in createUISlice.ts). */
export const DEFAULT_BOND_RADIUS = 0.08;

/** Historical aromatic-ring torus tube radius at the default bond radius. */
export const DEFAULT_RING_TUBE = 0.1;

/**
 * Tube (minor) radius for the aromatic-ring torus, scaled proportionally with the
 * bond radius so the Radius slider thickens the ring "donut" alongside the bonds.
 * At the default bond radius this returns DEFAULT_RING_TUBE, preserving the look.
 */
export function ringTubeRadius(bondRadius: number): number {
  return DEFAULT_RING_TUBE * (bondRadius / DEFAULT_BOND_RADIUS);
}
