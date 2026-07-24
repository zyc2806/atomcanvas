import { describe, it, expect } from 'vitest';
import { autoUp, latticeToWorld, resolveCameraView } from './cameraViews';
import type { Vec3 } from './cameraViews';

// A 4 Å cube of 8 atoms centred on (2,2,2): centroid and bounding radius are
// easy to reason about (radius = half the body diagonal = 2√3).
const CUBE: [number, number, number][] = [
    [0, 0, 0], [4, 0, 0], [0, 4, 0], [0, 0, 4],
    [4, 4, 0], [4, 0, 4], [0, 4, 4], [4, 4, 4],
];

const dirOf = (from: Vec3, to: Vec3): Vec3 => {
    const d: Vec3 = [from[0] - to[0], from[1] - to[1], from[2] - to[2]];
    const n = Math.hypot(...d);
    return [d[0] / n, d[1] / n, d[2] / n];
};

describe('autoUp', () => {
    it('uses world +z so slab side views keep the surface normal up', () => {
        expect(autoUp([1, 0, 0])).toEqual([0, 0, 1]);
        expect(autoUp([0, -1, 0])).toEqual([0, 0, 1]);
    });

    it('falls back to +y when looking along z (which +z cannot serve)', () => {
        expect(autoUp([0, 0, 1])).toEqual([0, 1, 0]);
        expect(autoUp([0, 0, -1])).toEqual([0, 1, 0]);
    });

    it('is defensive about a zero direction', () => {
        expect(autoUp([0, 0, 0])).toEqual([0, 1, 0]);
    });
});

describe('latticeToWorld', () => {
    it('maps [h k l] onto h*a + k*b + l*c', () => {
        const cell = [[4, 0, 0], [0, 5, 0], [0, 0, 6]];
        expect(latticeToWorld([1, 0, 0], cell)).toEqual([4, 0, 0]);
        expect(latticeToWorld([0, 0, -1], cell)).toEqual([0, 0, -6]);
        expect(latticeToWorld([1, 1, 1], cell)).toEqual([4, 5, 6]);
    });

    it('handles a non-orthogonal cell (row vectors)', () => {
        const cell = [[3, 0, 0], [1.5, 2.6, 0], [0, 0, 10]];
        expect(latticeToWorld([0, 1, 0], cell)).toEqual([1.5, 2.6, 0]);
    });

    it('passes the direction through when there is no usable cell', () => {
        expect(latticeToWorld([1, 2, 3], null)).toEqual([1, 2, 3]);
        expect(latticeToWorld([1, 2, 3], [[0, 0, 0], [0, 0, 0], [0, 0, 0]])).toEqual([1, 2, 3]);
    });
});

describe('resolveCameraView', () => {
    it('places the camera along the requested direction, aimed at the centroid', () => {
        const view = resolveCameraView({ spec: { direction: [0, -1, 0] }, positions: CUBE })!;
        expect(view.target).toEqual([2, 2, 2]);
        expect(dirOf(view.position, view.target)).toEqual([0, -1, 0]);
        expect(view.up).toEqual([0, 0, 1]);
        expect(view.zoom).toBe(1);
    });

    it('frames the structure: distance grows with the bounding radius', () => {
        const small = resolveCameraView({ spec: { direction: [0, 0, 1] }, positions: CUBE })!;
        const big = resolveCameraView({
            spec: { direction: [0, 0, 1] },
            positions: CUBE.map(([x, y, z]) => [x * 10, y * 10, z * 10] as [number, number, number]),
        })!;
        const dist = (v: typeof small) => Math.hypot(...(v.position.map((p, i) => p - v.target[i]) as Vec3));
        expect(dist(big)).toBeGreaterThan(dist(small));
    });

    it('reads a direction in the lattice frame when asked', () => {
        const cell = [[4, 0, 0], [0, 4, 0], [0, 0, 20]]; // a slab-ish cell: c is long
        const view = resolveCameraView({
            spec: { direction: [0, 0, 1], frame: 'lattice' },
            positions: CUBE,
            cell,
        })!;
        // c is +z here, so viewing along c == viewing along +z.
        expect(dirOf(view.position, view.target)).toEqual([0, 0, 1]);
    });

    it('lattice and cartesian differ once the cell is not axis-aligned', () => {
        const cell = [[3, 0, 0], [1.5, 2.6, 0], [0, 0, 10]];
        const lattice = resolveCameraView({ spec: { direction: [0, 1, 0], frame: 'lattice' }, positions: CUBE, cell })!;
        const cartesian = resolveCameraView({ spec: { direction: [0, 1, 0] }, positions: CUBE, cell })!;
        expect(dirOf(lattice.position, lattice.target)).not.toEqual(dirOf(cartesian.position, cartesian.target));
    });

    it('uses an absolute position verbatim, with no framing', () => {
        const view = resolveCameraView({
            spec: { position: [10, 0, 0], target: [0, 0, 0], zoom: 3 },
            positions: CUBE,
        })!;
        expect(view.position).toEqual([10, 0, 0]);
        expect(view.target).toEqual([0, 0, 0]);
        expect(view.zoom).toBe(3);
    });

    it('honours an explicit up vector', () => {
        const view = resolveCameraView({ spec: { direction: [1, 0, 0], up: [0, 1, 0] }, positions: CUBE })!;
        expect(view.up).toEqual([0, 1, 0]);
    });

    it('normalizes an explicit up vector', () => {
        const view = resolveCameraView({ spec: { direction: [1, 0, 0], up: [0, 5, 0] }, positions: CUBE })!;
        expect(view.up).toEqual([0, 1, 0]);
    });

    it('discards an up parallel to the view direction instead of emitting a degenerate basis', () => {
        const view = resolveCameraView({ spec: { direction: [1, 0, 0], up: [1, 0, 0] }, positions: CUBE })!;
        expect(view.up).toEqual([0, 0, 1]);
    });

    it('returns null when the spec says nothing about where to put the camera', () => {
        expect(resolveCameraView({ spec: {}, positions: CUBE })).toBeNull();
    });

    it('returns null for a zero-length direction', () => {
        expect(resolveCameraView({ spec: { direction: [0, 0, 0] }, positions: CUBE })).toBeNull();
    });

    it('returns null when the camera would sit on its own target', () => {
        expect(resolveCameraView({
            spec: { position: [1, 1, 1], target: [1, 1, 1] },
            positions: CUBE,
        })).toBeNull();
    });

    it('still resolves with no atoms (falls back to the origin)', () => {
        const view = resolveCameraView({ spec: { direction: [0, 0, 1] }, positions: [] })!;
        expect(view.target).toEqual([0, 0, 0]);
        expect(view.position[2]).toBeGreaterThan(0);
    });

    it('gives every structure the same direction and up — the batch-consistency guarantee', () => {
        const other: [number, number, number][] = [[-5, -5, -5], [7, 1, 3], [0, 9, 0]];
        const a = resolveCameraView({ spec: { direction: [1, 1, 0] }, positions: CUBE })!;
        const b = resolveCameraView({ spec: { direction: [1, 1, 0] }, positions: other })!;
        expect(dirOf(a.position, a.target)).toEqual(dirOf(b.position, b.target));
        expect(a.up).toEqual(b.up);
    });
});
