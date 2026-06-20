import { describe, it, expect } from 'vitest';
import { elementStylesToAtomOverrides } from './elementStyleApply';

describe('elementStylesToAtomOverrides', () => {
  const symbols = ['C', 'H', 'C', 'O'];

  it('maps element color/opacity to atom-index overrides', () => {
    const r = elementStylesToAtomOverrides(symbols, { C: { color: '#112233', opacity: 0.5 } });
    expect(r.colorOverrides).toEqual({ 0: '#112233', 2: '#112233' });
    expect(r.opacityOverrides).toEqual({ 0: 0.5, 2: 0.5 });
    expect(r.radiusOverrides).toEqual({});
  });

  it('returns radius overrides separately', () => {
    const r = elementStylesToAtomOverrides(symbols, { H: { radiusScale: 0.6 } });
    expect(r.radiusOverrides).toEqual({ 1: 0.6 });
  });
});
