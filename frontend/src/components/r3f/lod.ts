export interface LodSettings {
  sphereSegments: number;          // sphereGeometry width & height segments
  cylinderRadialSegments: number;  // cylinderGeometry radial segments
  showOutlines: boolean;           // gate drei <Outlines> (atoms/bonds)
  showBonds: boolean;              // gate the whole <Bonds> pipeline (bondHalves useMemo + draw)
  enableAO: boolean;               // gate the N8AO EffectComposer
  showLabels: boolean;             // hard-suppress per-atom AtomLabels sprites
}

export const LOD_FULL_DETAIL_MAX = 2_000;   // < this: untouched, byte-for-byte current behavior
export const LOD_REDUCED_MAX     = 20_000;  // [N1, N2): halve segments, keep outlines/bonds/AO
export const LOD_NO_OUTLINE_MAX  = 100_000; // [N2, N3): drop outlines + AO, coarser segments
                                            // >= N3: also drop bonds + labels

export function computeLod(atomCount: number): LodSettings {
  // Empty / closed scene: structureData is null -> atomCount is exactly 0. There
  // is nothing to occlude, so disable the full-screen N8AO pass; otherwise a
  // closed viewer keeps running ambient occlusion every frame forever. (Strict
  // `=== 0` so the defensive negative/NaN/Infinity paths below still clamp to the
  // normal full-detail tier with AO on.)
  if (atomCount === 0) return { sphereSegments: 32, cylinderRadialSegments: 8, showOutlines: true,  showBonds: true,  enableAO: false, showLabels: true };
  const n = Number.isFinite(atomCount) ? Math.max(0, atomCount) : 0;
  if (n < LOD_FULL_DETAIL_MAX) return { sphereSegments: 32, cylinderRadialSegments: 8, showOutlines: true,  showBonds: true,  enableAO: true,  showLabels: true };
  if (n < LOD_REDUCED_MAX)     return { sphereSegments: 16, cylinderRadialSegments: 6, showOutlines: true,  showBonds: true,  enableAO: true,  showLabels: true };
  if (n < LOD_NO_OUTLINE_MAX)  return { sphereSegments: 12, cylinderRadialSegments: 6, showOutlines: false, showBonds: true,  enableAO: false, showLabels: true };
  return                              { sphereSegments: 8,  cylinderRadialSegments: 4, showOutlines: false, showBonds: false, enableAO: false, showLabels: false };
}
