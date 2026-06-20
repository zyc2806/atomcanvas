import { describe, it, expect } from 'vitest';
import { resolveGizmoTargetCenter } from './axesGizmoUtils';

describe('resolveGizmoTargetCenter', () => {
    it('passes through viewTarget when provided', () => {
        const viewTarget: [number, number, number] = [1, 2, 3];
        const result = resolveGizmoTargetCenter({ viewTarget });
        expect(result).toEqual([1, 2, 3]);
    });

    it('returns a COPY of viewTarget, not the same reference', () => {
        const viewTarget: [number, number, number] = [1, 2, 3];
        const result = resolveGizmoTargetCenter({ viewTarget });
        // Mutating the result must not mutate the input
        result[0] = 99;
        expect(viewTarget[0]).toBe(1);
    });

    it('returns origin [0,0,0] when there is no structure and no viewTarget', () => {
        expect(resolveGizmoTargetCenter({ viewTarget: null })).toEqual([0, 0, 0]);
        expect(resolveGizmoTargetCenter({ viewTarget: null, structure: undefined })).toEqual([0, 0, 0]);
    });

    it('returns origin when structure has empty positions and no wrapped_positions', () => {
        const structure = {
            symbols: [] as string[],
            positions: [] as [number, number, number][],
            wrapped_positions: [] as [number, number, number][],
            pbc: [false, false, false] as [boolean, boolean, boolean],
        };
        expect(resolveGizmoTargetCenter({ viewTarget: null, structure })).toEqual([0, 0, 0]);
    });

    it('uses wrapped_positions when PBC is true and wrapped_positions is non-empty', () => {
        const structure = {
            symbols: ['C', 'C'],
            positions: [[0, 0, 0], [10, 10, 10]] as [number, number, number][],
            wrapped_positions: [[1, 0, 0], [3, 0, 0]] as [number, number, number][],
            pbc: [true, true, true] as [boolean, boolean, boolean],
        };
        const result = resolveGizmoTargetCenter({ viewTarget: null, structure });
        // centroid of wrapped_positions: [2, 0, 0]
        expect(result[0]).toBeCloseTo(2);
        expect(result[1]).toBeCloseTo(0);
        expect(result[2]).toBeCloseTo(0);
    });

    it('uses raw positions when PBC is false, even if wrapped_positions is non-empty', () => {
        const structure = {
            symbols: ['C', 'C'],
            positions: [[0, 0, 0], [4, 0, 0]] as [number, number, number][],
            wrapped_positions: [[1, 0, 0], [3, 0, 0]] as [number, number, number][],
            pbc: [false, false, false] as [boolean, boolean, boolean],
        };
        const result = resolveGizmoTargetCenter({ viewTarget: null, structure });
        // centroid of positions: [2, 0, 0]
        expect(result[0]).toBeCloseTo(2);
        expect(result[1]).toBeCloseTo(0);
        expect(result[2]).toBeCloseTo(0);
    });

    it('uses raw positions when PBC is true but wrapped_positions is empty', () => {
        const structure = {
            symbols: ['C', 'C'],
            positions: [[0, 0, 0], [6, 0, 0]] as [number, number, number][],
            wrapped_positions: [] as [number, number, number][],
            pbc: [true, false, false] as [boolean, boolean, boolean],
        };
        const result = resolveGizmoTargetCenter({ viewTarget: null, structure });
        // centroid of raw positions: [3, 0, 0]
        expect(result[0]).toBeCloseTo(3);
        expect(result[1]).toBeCloseTo(0);
        expect(result[2]).toBeCloseTo(0);
    });

    it('computes the centroid of multiple positions', () => {
        const structure = {
            symbols: ['C', 'C', 'C'],
            positions: [
                [0, 0, 0],
                [3, 0, 0],
                [0, 3, 0],
            ] as [number, number, number][],
            wrapped_positions: [] as [number, number, number][],
            pbc: [false, false, false] as [boolean, boolean, boolean],
        };
        const result = resolveGizmoTargetCenter({ viewTarget: null, structure });
        expect(result[0]).toBeCloseTo(1);
        expect(result[1]).toBeCloseTo(1);
        expect(result[2]).toBeCloseTo(0);
    });

    it('viewTarget takes precedence over a provided structure', () => {
        const structure = {
            symbols: ['C'],
            positions: [[100, 100, 100]] as [number, number, number][],
            wrapped_positions: [] as [number, number, number][],
            pbc: [false, false, false] as [boolean, boolean, boolean],
        };
        const viewTarget: [number, number, number] = [5, 6, 7];
        const result = resolveGizmoTargetCenter({ viewTarget, structure });
        expect(result).toEqual([5, 6, 7]);
    });
});
