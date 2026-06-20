import { describe, it, expect } from 'vitest';
import { computeFitBounds, computeFramingDistance } from './fitBounds';

// ---------------------------------------------------------------------------
// computeFitBounds
// ---------------------------------------------------------------------------
describe('computeFitBounds', () => {
    it('returns fallback center and undefined radius for empty positions', () => {
        const fallback: [number, number, number] = [1, 2, 3];
        const result = computeFitBounds([], fallback);
        expect(result.center).toEqual([1, 2, 3]);
        expect(result.radius).toBeUndefined();
    });

    it('returns fallback center when positions is null', () => {
        const result = computeFitBounds(null, [5, 6, 7]);
        expect(result.center).toEqual([5, 6, 7]);
        expect(result.radius).toBeUndefined();
    });

    it('returns fallback center when positions is undefined', () => {
        const result = computeFitBounds(undefined, [0, 0, 0]);
        expect(result.center).toEqual([0, 0, 0]);
        expect(result.radius).toBeUndefined();
    });

    it('defaults fallbackCenter to origin when not provided', () => {
        const result = computeFitBounds([]);
        expect(result.center).toEqual([0, 0, 0]);
    });

    it('returns radius 0 and the atom position as centroid for a single atom', () => {
        const result = computeFitBounds([[3, 4, 5]]);
        expect(result.center).toEqual([3, 4, 5]);
        expect(result.radius).toBeCloseTo(0);
    });

    it('computes the centroid as the mean of positions', () => {
        const positions: [number, number, number][] = [
            [0, 0, 0],
            [4, 0, 0],
        ];
        const result = computeFitBounds(positions);
        expect(result.center[0]).toBeCloseTo(2);
        expect(result.center[1]).toBeCloseTo(0);
        expect(result.center[2]).toBeCloseTo(0);
    });

    it('radius equals the max distance from centroid to any atom', () => {
        // centroid = ([−5+5+0]/3, [0+0+0]/3, 0) = (0, 0, 0)
        // distances: 5, 5, 0 → radius = 5
        const positions: [number, number, number][] = [
            [-5, 0, 0],
            [5, 0, 0],
            [0, 0, 0],
        ];
        const result = computeFitBounds(positions);
        expect(result.radius).toBeCloseTo(5);
    });

    it('computes centroid and radius for three atoms', () => {
        const positions: [number, number, number][] = [
            [0, 0, 0],
            [3, 0, 0],
            [0, 3, 0],
        ];
        const result = computeFitBounds(positions);
        // centroid = [1, 1, 0]
        expect(result.center[0]).toBeCloseTo(1);
        expect(result.center[1]).toBeCloseTo(1);
        expect(result.center[2]).toBeCloseTo(0);
        // max dist from [1,1,0]: to [0,0,0] = sqrt(2) ≈ 1.414; to [3,0,0] = sqrt(4+1)=sqrt(5)≈2.236; to [0,3,0] = sqrt(1+4)=sqrt(5)
        expect(result.radius).toBeCloseTo(Math.sqrt(5), 4);
    });
});

// ---------------------------------------------------------------------------
// computeFramingDistance
// ---------------------------------------------------------------------------
describe('computeFramingDistance', () => {
    it('applies the exact formula: max((max(radius, 0.8) * 1.6) / sin(fovRad/2), 3)', () => {
        const radius = 2;
        const fovDeg = 50;
        const halfFov = (fovDeg * Math.PI) / 180 / 2;
        const expected = Math.max((Math.max(radius, 0.8) * 1.6) / Math.sin(halfFov), 3);
        expect(computeFramingDistance(radius, fovDeg)).toBeCloseTo(expected, 10);
    });

    it('clamps to minimum distance 3 for a tiny molecule', () => {
        // A very small radius (0 → clamped to 0.8) with a wide FOV → might yield < 3
        // Let's use a very wide FOV (170°) to make the formula yield < 3
        const result = computeFramingDistance(0, 170);
        expect(result).toBeGreaterThanOrEqual(3);
    });

    it('clamps the effective radius to at least 0.8', () => {
        // radius = 0 → effective radius = 0.8
        const fovDeg = 50;
        const halfFov = (fovDeg * Math.PI) / 180 / 2;
        const expected = Math.max((0.8 * 1.6) / Math.sin(halfFov), 3);
        expect(computeFramingDistance(0, fovDeg)).toBeCloseTo(expected, 10);
    });

    it('treats undefined radius as 0 (falls back to 0.8 floor)', () => {
        const fovDeg = 50;
        expect(computeFramingDistance(undefined, fovDeg)).toBeCloseTo(
            computeFramingDistance(0, fovDeg),
            10,
        );
    });

    it('falls back to 50° FOV when fovDeg is undefined', () => {
        const radius = 3;
        expect(computeFramingDistance(radius, undefined)).toBeCloseTo(
            computeFramingDistance(radius, 50),
            10,
        );
    });

    it('falls back to 50° FOV when fovDeg is 0', () => {
        const radius = 3;
        expect(computeFramingDistance(radius, 0)).toBeCloseTo(
            computeFramingDistance(radius, 50),
            10,
        );
    });

    it('falls back to 50° FOV when fovDeg is NaN', () => {
        const radius = 3;
        expect(computeFramingDistance(radius, NaN)).toBeCloseTo(
            computeFramingDistance(radius, 50),
            10,
        );
    });

    it('larger radius produces larger camera distance', () => {
        const fovDeg = 50;
        const d1 = computeFramingDistance(1, fovDeg);
        const d2 = computeFramingDistance(10, fovDeg);
        expect(d2).toBeGreaterThan(d1);
    });
});
