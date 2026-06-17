import { describe, it, expect } from 'vitest';
import { getRenderedAtomRadius, getBondSurfaceTrim, getOpacityAwareBondTrim } from './bondUtils';

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
