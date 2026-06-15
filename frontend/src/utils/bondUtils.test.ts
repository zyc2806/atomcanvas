import { describe, it, expect } from 'vitest';
import { getRenderedAtomRadius, getBondSurfaceTrim } from './bondUtils';

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
