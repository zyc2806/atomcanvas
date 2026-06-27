import { describe, it, expect } from 'vitest';
import { displayPositions } from './displayPositions';

type Pos = [number, number, number][];

describe('displayPositions', () => {
    const raw: Pos = [[-0.7, 2, 2], [0.7, 2, 2]];
    const wrapped: Pos = [[3.3, 2, 2], [0.7, 2, 2]];

    it('uses wrapped_positions (the in-cell display basis) when present and same length', () => {
        expect(displayPositions({ positions: raw, wrapped_positions: wrapped })).toBe(wrapped);
    });

    it('falls back to raw positions when wrapped_positions is missing', () => {
        expect(displayPositions({ positions: raw, wrapped_positions: undefined })).toBe(raw);
    });

    it('falls back to raw positions when wrapped_positions is empty or a length mismatch', () => {
        expect(displayPositions({ positions: raw, wrapped_positions: [] })).toBe(raw);
        expect(displayPositions({ positions: raw, wrapped_positions: [[3.3, 2, 2]] })).toBe(raw);
    });

    it('non-periodic: wrapped_positions equals positions, returns the wrapped array (a no-op visually)', () => {
        const same: Pos = [[1, 1, 1]];
        const w: Pos = [[1, 1, 1]];
        expect(displayPositions({ positions: same, wrapped_positions: w })).toBe(w);
    });
});
