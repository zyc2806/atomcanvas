import { describe, it, expect } from 'vitest';
import { isRenderableRegularBond, isRenderableGhostBond } from './bondRenderability';

// ---------------------------------------------------------------------------
// isRenderableRegularBond
// ---------------------------------------------------------------------------
describe('isRenderableRegularBond', () => {
    const positions: [number, number, number][] = [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
    ];

    it('accepts a normal bond between two distinct atoms', () => {
        expect(isRenderableRegularBond(0, 1, positions)).toBe(true);
    });

    it('rejects a self-bond (idx1 === idx2)', () => {
        expect(isRenderableRegularBond(0, 0, positions)).toBe(false);
    });

    it('rejects a negative idx1', () => {
        expect(isRenderableRegularBond(-1, 1, positions)).toBe(false);
    });

    it('rejects a negative idx2', () => {
        expect(isRenderableRegularBond(0, -1, positions)).toBe(false);
    });

    it('rejects idx1 out-of-bounds (>= atomCount)', () => {
        expect(isRenderableRegularBond(positions.length, 0, positions)).toBe(false);
    });

    it('rejects idx2 out-of-bounds (>= atomCount)', () => {
        expect(isRenderableRegularBond(0, positions.length, positions)).toBe(false);
    });

    it('rejects when idx1 points to non-finite x coordinate', () => {
        const badPositions: [number, number, number][] = [
            [NaN, 0, 0],
            [1, 0, 0],
        ];
        expect(isRenderableRegularBond(0, 1, badPositions)).toBe(false);
    });

    it('rejects when idx2 points to non-finite y coordinate (Infinity)', () => {
        const badPositions: [number, number, number][] = [
            [0, 0, 0],
            [1, Infinity, 0],
        ];
        expect(isRenderableRegularBond(0, 1, badPositions)).toBe(false);
    });

    it('rejects a degenerate bond with zero length (same position)', () => {
        const samePos: [number, number, number][] = [
            [1, 2, 3],
            [1, 2, 3],
        ];
        expect(isRenderableRegularBond(0, 1, samePos)).toBe(false);
    });

    it('rejects a bond whose length-squared is exactly at the 1e-12 threshold (not strictly greater)', () => {
        // dist = 1e-6 → distSq = 1e-12, which is NOT > 1e-12
        const tinyDist = 1e-6;
        const nearSamePos: [number, number, number][] = [
            [0, 0, 0],
            [tinyDist, 0, 0],
        ];
        expect(isRenderableRegularBond(0, 1, nearSamePos)).toBe(false);
    });

    it('accepts a bond with length-squared just above the threshold', () => {
        // dist slightly above 1e-6 → distSq > 1e-12
        const tinyDist = 2e-6;
        const nearSamePos: [number, number, number][] = [
            [0, 0, 0],
            [tinyDist, 0, 0],
        ];
        expect(isRenderableRegularBond(0, 1, nearSamePos)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// isRenderableGhostBond
// ---------------------------------------------------------------------------
describe('isRenderableGhostBond', () => {
    const startPos: [number, number, number] = [0, 0, 0];
    const endPos: [number, number, number] = [1, 0, 0];
    const atomCount = 5;

    it('accepts a normal ghost bond', () => {
        expect(isRenderableGhostBond(startPos, endPos, 0, 1, atomCount)).toBe(true);
    });

    it('rejects when atomIdx === otherIdx (self-bond)', () => {
        expect(isRenderableGhostBond(startPos, endPos, 2, 2, atomCount)).toBe(false);
    });

    it('rejects when atomIdx is negative', () => {
        expect(isRenderableGhostBond(startPos, endPos, -1, 1, atomCount)).toBe(false);
    });

    it('rejects when otherIdx is negative', () => {
        expect(isRenderableGhostBond(startPos, endPos, 0, -1, atomCount)).toBe(false);
    });

    it('rejects when atomIdx >= atomCount', () => {
        expect(isRenderableGhostBond(startPos, endPos, atomCount, 1, atomCount)).toBe(false);
    });

    it('rejects when otherIdx >= atomCount', () => {
        expect(isRenderableGhostBond(startPos, endPos, 0, atomCount, atomCount)).toBe(false);
    });

    it('rejects when startPos has a non-finite coordinate', () => {
        const badStart: [number, number, number] = [NaN, 0, 0];
        expect(isRenderableGhostBond(badStart, endPos, 0, 1, atomCount)).toBe(false);
    });

    it('rejects when endPos has a non-finite coordinate', () => {
        const badEnd: [number, number, number] = [1, -Infinity, 0];
        expect(isRenderableGhostBond(startPos, badEnd, 0, 1, atomCount)).toBe(false);
    });

    it('rejects a zero-length ghost bond (start === end)', () => {
        const same: [number, number, number] = [5, 5, 5];
        expect(isRenderableGhostBond(same, same, 0, 1, atomCount)).toBe(false);
    });
});
