import { describe, it, expect } from 'vitest';
import { buildAtomLabels } from './atomLabelData';

describe('buildAtomLabels', () => {
  const symbols = ['O', 'H', 'H'];
  const positions: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ];

  it('returns no labels when showLabels is off', () => {
    expect(buildAtomLabels(symbols, positions, false)).toEqual([]);
  });

  it('returns one label per atom when showLabels is on', () => {
    expect(buildAtomLabels(symbols, positions, true)).toHaveLength(3);
  });

  it('labels each atom with its element symbol and per-element index', () => {
    const labels = buildAtomLabels(symbols, positions, true);
    expect(labels.map((l) => l.text)).toEqual(['O1', 'H1', 'H2']);
  });

  it('places each label at its atom position', () => {
    const labels = buildAtomLabels(symbols, positions, true);
    expect(labels[1].position).toEqual([1, 0, 0]);
  });
});
