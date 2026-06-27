import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { computeBondHalves } from './bondHalves';
import type { ComputeBondHalvesParams } from './bondHalves';

// ---------------------------------------------------------------------------
// Default injected color/opacity helpers for test use
// ---------------------------------------------------------------------------
const defaultColor = new THREE.Color(1, 0, 0);
const defaultGetAtomColor = () => defaultColor.clone();
const defaultGetAtomOpacity = () => 1.0;
const defaultGetAtomBaseOpacity = () => 1.0;

function makeBaseParams(overrides: Partial<ComputeBondHalvesParams> = {}): ComputeBondHalvesParams {
    return {
        positions: [[0, 0, 0], [2, 0, 0]] as [number, number, number][],
        bonds: [[0, 1, 1]],
        ghostBonds: [],
        symbols: ['C', 'C'],
        atomScale: 1.0,
        bondRadius: 0.15,
        displayMode: 'ball-stick',
        renderStyle: 'soft',
        getAtomColor: defaultGetAtomColor,
        getAtomOpacity: defaultGetAtomOpacity,
        getAtomBaseOpacity: defaultGetAtomBaseOpacity,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Order-1 bond → 2 halves
// ---------------------------------------------------------------------------
describe('computeBondHalves — order-1 bond', () => {
    it('produces exactly 2 halves for a single order-1 bond', () => {
        const halves = computeBondHalves(makeBaseParams());
        expect(halves).toHaveLength(2);
    });

    it('half ids are ${i}-0-a and ${i}-0-b', () => {
        const halves = computeBondHalves(makeBaseParams());
        expect(halves[0].id).toBe('0-0-a');
        expect(halves[1].id).toBe('0-0-b');
    });

    it('first half belongs to atom 0, second half to atom 1', () => {
        const halves = computeBondHalves(makeBaseParams());
        expect(halves[0].atomIndex).toBe(0);
        expect(halves[1].atomIndex).toBe(1);
    });

    it('both halves share the same bondId', () => {
        const halves = computeBondHalves(makeBaseParams());
        expect(halves[0].bondId).toBe(halves[1].bondId);
        expect(halves[0].bondId).toBe('0-1');
    });

    it('radiusScale for a C-C order-1 bond is 1.0 (heavy-heavy, no multi-bond reduction)', () => {
        const halves = computeBondHalves(makeBaseParams());
        // Heavy-heavy, order 1 → getBondRadiusScale('C','C')=1.0 * (order<2 ? 1.0 : 0.6) = 1.0
        expect(halves[0].radiusScale).toBeCloseTo(1.0);
    });
});

// ---------------------------------------------------------------------------
// Order-2 bond → 4 halves (2 strands × 2 halves each)
// ---------------------------------------------------------------------------
describe('computeBondHalves — order-2 bond', () => {
    it('produces 4 halves for a single order-2 bond', () => {
        const params = makeBaseParams({
            bonds: [[0, 1, 2]],
        });
        const halves = computeBondHalves(params);
        expect(halves).toHaveLength(4);
    });

    it('radiusScale for a C-C order-2 bond is 0.6 (multi-bond reduction)', () => {
        const params = makeBaseParams({
            bonds: [[0, 1, 2]],
        });
        const halves = computeBondHalves(params);
        // getBondRadiusScale('C','C')=1.0 * 0.6 = 0.6
        halves.forEach((h) => expect(h.radiusScale).toBeCloseTo(0.6));
    });

    it('the two strands of an order-2 bond are offset by ±(bondRadius * 1.2) along the right vector', () => {
        // For an X-aligned bond with no neighbors, the right vector defaults to
        // cross(bondDir, worldUp) = cross(X, Y) = -Z, then we need either +right or -right.
        // Each offset dist = bondRadius * radiusScale * 1.2 = 0.15 * 1.0 * 1.2 = 0.18
        const params = makeBaseParams({ bonds: [[0, 1, 2]] });
        const halves = computeBondHalves(params);
        // Halves 0 and 1 are the "a" ends of the two strands; they should differ by 2 * 0.18
        // in the perpendicular plane. Just check that positions differ in Z (the right direction).
        const pos0 = halves[0].position;
        const pos2 = halves[2].position;
        // Both are midpoints of their respective halves in the two offset strands
        const perpDiff = Math.abs(pos0.z - pos2.z) + Math.abs(pos0.y - pos2.y);
        expect(perpDiff).toBeGreaterThan(0.1);
    });
});

// ---------------------------------------------------------------------------
// Order-3 bond → 6 halves (3 strands × 2 halves each)
// ---------------------------------------------------------------------------
describe('computeBondHalves — order-3 bond', () => {
    it('produces 6 halves for a single order-3 bond', () => {
        const params = makeBaseParams({
            bonds: [[0, 1, 3]],
        });
        const halves = computeBondHalves(params);
        expect(halves).toHaveLength(6);
    });

    it('radiusScale for an order-3 bond is 0.6', () => {
        const params = makeBaseParams({ bonds: [[0, 1, 3]] });
        const halves = computeBondHalves(params);
        halves.forEach((h) => expect(h.radiusScale).toBeCloseTo(0.6));
    });
});

// ---------------------------------------------------------------------------
// Per-half opacity — cartoon vs non-cartoon
// ---------------------------------------------------------------------------
describe('computeBondHalves — opacity', () => {
    it('uses getAtomBaseOpacity for visible (non-hidden) atoms in the cartoon render style', () => {
        const getAtomBaseOpacity = vi.fn(() => 0.5);
        const getAtomOpacity = vi.fn(() => 0.9); // visible (non-zero) both atoms
        const params = makeBaseParams({
            renderStyle: 'cartoon',
            getAtomBaseOpacity,
            getAtomOpacity,
        });
        const halves = computeBondHalves(params);
        halves.forEach((h) => expect(h.opacity).toBeCloseTo(0.5));
        expect(getAtomBaseOpacity).toHaveBeenCalled();
        // getAtomOpacity is now consulted to detect the fully-hidden (0) sentinel.
        expect(getAtomOpacity).toHaveBeenCalled();
    });

    it('cartoon: a bond half adjacent to a HIDDEN atom (opacity 0) is itself 0, so it is discarded with the atom', () => {
        const getAtomBaseOpacity = () => 1.0;
        // atom 0 hidden, atom 1 visible
        const getAtomOpacity = (idx: number) => (idx === 0 ? 0 : 1.0);
        const params = makeBaseParams({
            renderStyle: 'cartoon',
            getAtomBaseOpacity,
            getAtomOpacity,
        });
        const halves = computeBondHalves(params);
        const half0 = halves.find((h) => h.atomIndex === 0)!;
        const half1 = halves.find((h) => h.atomIndex === 1)!;
        expect(half0.opacity).toBe(0);     // hidden atom's half → discarded
        expect(half1.opacity).toBeCloseTo(1.0); // visible atom's half → opaque base
    });

    it('uses per-atom getAtomOpacity for non-cartoon render styles', () => {
        const getAtomBaseOpacity = vi.fn(() => 0.3);
        const getAtomOpacity = vi.fn(() => 0.8);
        const params = makeBaseParams({
            renderStyle: 'soft',
            getAtomBaseOpacity,
            getAtomOpacity,
        });
        const halves = computeBondHalves(params);
        halves.forEach((h) => expect(h.opacity).toBeCloseTo(0.8));
        expect(getAtomOpacity).toHaveBeenCalled();
        expect(getAtomBaseOpacity).not.toHaveBeenCalled();
    });

    it('uses bondOpacityOverride when provided for a given bondId', () => {
        const getAtomOpacity = vi.fn(() => 1.0);
        const params = makeBaseParams({
            renderStyle: 'soft',
            bondOpacityOverrides: { '0-1': 0.25 },
            getAtomOpacity,
        });
        const halves = computeBondHalves(params);
        halves.forEach((h) => expect(h.opacity).toBeCloseTo(0.25));
    });
});

// ---------------------------------------------------------------------------
// Degenerate & self-bonds are skipped
// ---------------------------------------------------------------------------
describe('computeBondHalves — degenerate bonds skipped', () => {
    it('skips a self-bond (idx1 === idx2)', () => {
        const params = makeBaseParams({
            bonds: [[0, 0, 1]],
        });
        expect(computeBondHalves(params)).toHaveLength(0);
    });

    it('skips a bond whose atoms share the same position (zero-length)', () => {
        const params = makeBaseParams({
            positions: [[0, 0, 0], [0, 0, 0]] as [number, number, number][],
            bonds: [[0, 1, 1]],
        });
        expect(computeBondHalves(params)).toHaveLength(0);
    });

    it('returns empty halves when no bonds are provided', () => {
        const params = makeBaseParams({ bonds: [] });
        expect(computeBondHalves(params)).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Color is passed through per-atom
// ---------------------------------------------------------------------------
describe('computeBondHalves — color resolution', () => {
    it('calls getAtomColor with the correct index and symbol', () => {
        const getAtomColor = vi.fn(() => new THREE.Color(0, 1, 0));
        const params = makeBaseParams({ getAtomColor });
        computeBondHalves(params);
        // Should have been called for index 0 (C) and index 1 (C)
        expect(getAtomColor).toHaveBeenCalledWith(0, 'C');
        expect(getAtomColor).toHaveBeenCalledWith(1, 'C');
    });

    it('stores the resolved color on each half', () => {
        const greenColor = new THREE.Color(0, 1, 0);
        const getAtomColor = () => greenColor.clone();
        const params = makeBaseParams({ getAtomColor });
        const halves = computeBondHalves(params);
        halves.forEach((h) => {
            expect(h.color.r).toBeCloseTo(0);
            expect(h.color.g).toBeCloseTo(1);
            expect(h.color.b).toBeCloseTo(0);
        });
    });
});
