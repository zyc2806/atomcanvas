import { describe, it, expect } from 'vitest';
import { selectFramePositions } from './trajectory';
import type { StandardStructureObject } from '../types/store';

const doc = (frames: number): StandardStructureObject => ({
  structure: {
    symbols: ['O', 'H', 'H'],
    positions: [[0, 0, 0], [0.96, 0, 0], [-0.24, 0.93, 0]],
    wrapped_positions: [[0, 0, 0], [0.96, 0, 0], [-0.24, 0.93, 0]],
  },
  visualization: { bonds: [], h_bond_geometries: [], unwrapped_h_bonds: [], wrapped_ghost_bonds: [] },
  trajectory: Array.from({ length: frames }, (_, f) => ({
    symbols: ['O', 'H', 'H'],
    positions: [[f, 0, 0], [f + 0.96, 0, 0], [f - 0.24, 0.93, 0]],
    wrapped_positions: [[f, 0, 0], [f + 0.96, 0, 0], [f - 0.24, 0.93, 0]],
  })),
});

describe('selectFramePositions', () => {
  it('returns null for null structureData', () => {
    expect(selectFramePositions(null, 1)).toBeNull();
    expect(selectFramePositions(undefined, 1)).toBeNull();
  });

  it('returns null for a single-frame or missing trajectory (render as-is)', () => {
    const noTraj = doc(0);
    delete (noTraj as { trajectory?: unknown }).trajectory;
    expect(selectFramePositions(noTraj, 0)).toBeNull();
    expect(selectFramePositions(doc(1), 0)).toBeNull();
  });

  it('returns RAW frame-0 positions for a multi-frame trajectory (one continuous basis — no wrapped-vs-raw teleport at the 0↔1 boundary)', () => {
    const d = doc(5);
    expect(selectFramePositions(d, 0)).toEqual(d.trajectory![0].positions);
  });

  it('returns the requested frame positions for a valid non-zero frame', () => {
    const d = doc(5);
    expect(selectFramePositions(d, 1)).toEqual(d.trajectory![1].positions);
    expect(selectFramePositions(d, 4)).toEqual(d.trajectory![4].positions);
  });

  it('clamps an out-of-range frame index to the nearest valid frame', () => {
    const d = doc(5);
    expect(selectFramePositions(d, 99)).toEqual(d.trajectory![4].positions);
    expect(selectFramePositions(d, -1)).toEqual(d.trajectory![0].positions);
  });
});
