import { describe, it, expect } from 'vitest';
import { ringTubeRadius, DEFAULT_BOND_RADIUS, DEFAULT_RING_TUBE } from './ringGeometry';

describe('ringTubeRadius', () => {
  it('returns the default tube radius at the default bond radius', () => {
    // Preserves the historical look: at the default bond radius the aromatic
    // torus tube must equal the old hardcoded 0.1.
    expect(ringTubeRadius(DEFAULT_BOND_RADIUS)).toBeCloseTo(DEFAULT_RING_TUBE, 6);
  });

  it('scales the tube radius proportionally with the bond radius', () => {
    expect(ringTubeRadius(2 * DEFAULT_BOND_RADIUS)).toBeCloseTo(2 * DEFAULT_RING_TUBE, 6);
    expect(ringTubeRadius(0.5 * DEFAULT_BOND_RADIUS)).toBeCloseTo(0.5 * DEFAULT_RING_TUBE, 6);
  });
});
