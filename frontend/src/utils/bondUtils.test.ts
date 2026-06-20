import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  getRenderedAtomRadius,
  getBondSurfaceTrim,
  getOpacityAwareBondTrim,
  getBondRadiusScale,
  calculateBondTransform,
  clipBondToAtomSurfaces,
  clipGhostBondFromAtomToBoundary,
} from './bondUtils';

describe('getRenderedAtomRadius', () => {
  it('defaults the radius override to 1 (no shrink)', () => {
    expect(getRenderedAtomRadius(1.0, 2.0, 'ball-stick')).toBeCloseTo(2.0);
  });

  it('shrinks the rendered radius by a per-atom radius override', () => {
    // Issue #1: a 0.3x size override must shrink the radius used to trim bonds.
    // Without it, the cylinder is trimmed as if the atom were full-size, leaving
    // a floating gap between the shrunken atom and the bond.
    expect(getRenderedAtomRadius(1.0, 2.0, 'ball-stick', 0.3)).toBeCloseTo(0.6);
  });

  it('applies the override inside the wireframe hit-scale too', () => {
    // wireframe uses a 0.3 mode scale; override multiplies on top of it.
    expect(getRenderedAtomRadius(1.0, 2.0, 'wireframe', 0.5)).toBeCloseTo(2.0 * 0.3 * 0.5);
  });
});

describe('bond trim follows the overridden atom radius', () => {
  it('a shrunken atom trims the bond less, keeping the cylinder attached', () => {
    // With a centered bond (offsetLengthSq=0), the trim equals the atom radius.
    // A 0.3x override must move the bond-half start to ~elementRadius*0.3*atomScale.
    const elementRadius = 1.0;
    const atomScale = 1.5;
    const full = getBondSurfaceTrim(
      getRenderedAtomRadius(elementRadius, atomScale, 'ball-stick', 1), 0, 'ball-stick');
    const shrunk = getBondSurfaceTrim(
      getRenderedAtomRadius(elementRadius, atomScale, 'ball-stick', 0.3), 0, 'ball-stick');
    expect(full).toBeCloseTo(1.5);
    expect(shrunk).toBeCloseTo(0.45);
  });
});

describe('getOpacityAwareBondTrim', () => {
  it('runs the bond to the atom center (trim 0) for an opaque atom', () => {
    // Opaque atom: the solid sphere hides the inner cylinder cap, so the bond
    // half runs to the center and never protrudes past the curved surface.
    const radius = getRenderedAtomRadius(1.0, 1.5, 'ball-stick');
    expect(getOpacityAwareBondTrim(radius, 0, 'ball-stick', false)).toBe(0);
  });

  it('keeps the surface trim for a transparent atom', () => {
    // Transparent (glass) atom: keep trimming to the surface, else the cylinder
    // shows through the sphere.
    const radius = getRenderedAtomRadius(1.0, 1.5, 'ball-stick');
    expect(getOpacityAwareBondTrim(radius, 0, 'ball-stick', true)).toBeCloseTo(
      getBondSurfaceTrim(radius, 0, 'ball-stick'),
    );
  });

  it('buries a thick bond cap at the centre of an opaque atom (no protrusion)', () => {
    // The "ball stuck on cylinder" artifact: a flat cap of radius bondRadius
    // overhangs the curved sphere when surface-trimmed and the bond is thick.
    // Running to the centre (trim 0) for the opaque atom removes the cap from
    // the surface entirely — even when the bond is far thicker than the atom.
    const atomRadius = 0.22; // a small H atom
    const offsetLengthSq = 0; // single bond, on-axis
    expect(getOpacityAwareBondTrim(atomRadius, offsetLengthSq, 'ball-stick', false)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getBondRadiusScale
// ---------------------------------------------------------------------------
describe('getBondRadiusScale', () => {
  it('returns 1.0 for two heavy atoms', () => {
    expect(getBondRadiusScale('C', 'N')).toBe(1.0);
  });

  it('returns 1.0 for two identical heavy atoms', () => {
    expect(getBondRadiusScale('O', 'O')).toBe(1.0);
  });

  it('returns 0.6 when the first element is H', () => {
    expect(getBondRadiusScale('H', 'C')).toBe(0.6);
  });

  it('returns 0.6 when the second element is H', () => {
    expect(getBondRadiusScale('C', 'H')).toBe(0.6);
  });

  it('returns 0.6 for H-H bond', () => {
    expect(getBondRadiusScale('H', 'H')).toBe(0.6);
  });

  it('is symmetric: swapping symbol order gives the same result', () => {
    expect(getBondRadiusScale('H', 'N')).toBe(getBondRadiusScale('N', 'H'));
    expect(getBondRadiusScale('C', 'O')).toBe(getBondRadiusScale('O', 'C'));
  });
});

// ---------------------------------------------------------------------------
// calculateBondTransform
// ---------------------------------------------------------------------------
describe('calculateBondTransform', () => {
  it('places the transform position at the midpoint of the segment', () => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [4, 0, 0];
    const { position } = calculateBondTransform(start, end);
    expect(position.x).toBeCloseTo(2);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(0);
  });

  it('encodes the segment length in the scale', () => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [3, 4, 0]; // length = 5
    const { scale } = calculateBondTransform(start, end);
    expect(scale).toBeCloseTo(5);
  });

  it('quaternion rotates the +Y axis onto the segment direction (axis-aligned X segment)', () => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [1, 0, 0];
    const { quaternion } = calculateBondTransform(start, end);

    // Apply quaternion to the +Y unit vector; result should equal +X
    const yAxis = new THREE.Vector3(0, 1, 0);
    yAxis.applyQuaternion(quaternion);

    expect(yAxis.x).toBeCloseTo(1, 5);
    expect(yAxis.y).toBeCloseTo(0, 5);
    expect(yAxis.z).toBeCloseTo(0, 5);
  });

  it('quaternion rotates +Y onto the normalised direction for a diagonal segment', () => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [1, 1, 0];
    const { quaternion } = calculateBondTransform(start, end);

    const expected = new THREE.Vector3(1, 1, 0).normalize();
    const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);

    expect(yAxis.x).toBeCloseTo(expected.x, 5);
    expect(yAxis.y).toBeCloseTo(expected.y, 5);
    expect(yAxis.z).toBeCloseTo(expected.z, 5);
  });

  it('quaternion is a unit quaternion (length = 1)', () => {
    const { quaternion } = calculateBondTransform([1, 2, 3], [4, 6, 8]);
    const len = Math.sqrt(
      quaternion.x * quaternion.x +
      quaternion.y * quaternion.y +
      quaternion.z * quaternion.z +
      quaternion.w * quaternion.w,
    );
    expect(len).toBeCloseTo(1, 10);
  });
});

// ---------------------------------------------------------------------------
// clipBondToAtomSurfaces
// ---------------------------------------------------------------------------
describe('clipBondToAtomSurfaces', () => {
  it('returns null for a degenerate (zero-length) segment', () => {
    const pos: [number, number, number] = [1, 2, 3];
    expect(clipBondToAtomSurfaces(pos, pos, 0, 0)).toBeNull();
  });

  it('shortens the segment from both ends by the trim amounts', () => {
    // 10-unit segment along X; trim 1 from start, 2 from end → 7-unit segment
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [10, 0, 0];
    const result = clipBondToAtomSurfaces(start, end, 1, 2);
    expect(result).not.toBeNull();
    expect(result!.start[0]).toBeCloseTo(1);
    expect(result!.end[0]).toBeCloseTo(8);
  });

  it('returns null when segment is shorter than minLength even before any trim', () => {
    // The segment is 0.01 units which is less than DEFAULT_MIN_CLIPPED_BOND_LENGTH (0.02).
    // After scaling the trim to maxAllowedTrim=0, the remaining length is 0.01 < minLength → null.
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [0.01, 0, 0];
    expect(clipBondToAtomSurfaces(start, end, 0, 0, 0.02)).toBeNull();
  });

  it('clips proportionally (does not return null) when trim exceeds maxAllowedTrim', () => {
    // When total trim > (distance - minLength), the function scales down the trim to
    // preserve at least minLength. It does NOT return null in this case.
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [0.5, 0, 0];
    // trims 0.3+0.3=0.6; maxAllowedTrim = 0.5 - 0.02 = 0.48; scaled to 0.24 each
    const result = clipBondToAtomSurfaces(start, end, 0.3, 0.3);
    expect(result).not.toBeNull();
  });

  it('with zero trims returns the full segment unchanged', () => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [5, 0, 0];
    const result = clipBondToAtomSurfaces(start, end, 0, 0);
    expect(result).not.toBeNull();
    expect(result!.start[0]).toBeCloseTo(0);
    expect(result!.end[0]).toBeCloseTo(5);
  });
});

// ---------------------------------------------------------------------------
// clipGhostBondFromAtomToBoundary
// ---------------------------------------------------------------------------
describe('clipGhostBondFromAtomToBoundary', () => {
  it('only trims the start (atomTrim), leaves end untouched', () => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [10, 0, 0];
    const result = clipGhostBondFromAtomToBoundary(start, end, 2);
    expect(result).not.toBeNull();
    // Start should be shifted by atomTrim along the direction
    expect(result!.start[0]).toBeCloseTo(2);
    // End should be unmodified
    expect(result!.end[0]).toBeCloseTo(10);
  });

  it('scales down atomTrim proportionally when it exceeds maxAllowedTrim (does not return null)', () => {
    // clipGhostBondFromAtomToBoundary delegates to clipBondToAtomSurfaces(start, end, atomTrim, 0).
    // When atomTrim > maxAllowedTrim it is scaled; the segment survives at minLength.
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [0.5, 0, 0];
    const result = clipGhostBondFromAtomToBoundary(start, end, 0.6);
    expect(result).not.toBeNull();
  });

  it('returns null for a segment shorter than minLength', () => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [0.01, 0, 0]; // 0.01 < default minLength 0.02
    expect(clipGhostBondFromAtomToBoundary(start, end, 0)).toBeNull();
  });

  it('zero atomTrim returns the full segment', () => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [3, 0, 0];
    const result = clipGhostBondFromAtomToBoundary(start, end, 0);
    expect(result).not.toBeNull();
    expect(result!.start[0]).toBeCloseTo(0);
    expect(result!.end[0]).toBeCloseTo(3);
  });
});
