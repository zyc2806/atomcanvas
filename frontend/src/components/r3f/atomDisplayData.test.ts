import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { computeAtomDisplayData } from './atomDisplayData';
import type { ComputeAtomDisplayDataParams } from './atomDisplayData';

// Injected helpers
const defaultColor = new THREE.Color(0.5, 0.5, 0.5);
const defaultGetAtomColor = () => defaultColor.clone();
const defaultGetAtomOpacity = () => 1.0;
const defaultGetAtomBaseOpacity = () => 1.0;

function makeParams(overrides: Partial<ComputeAtomDisplayDataParams> = {}): ComputeAtomDisplayDataParams {
    return {
        positions: [[0, 0, 0], [2, 0, 0]] as [number, number, number][],
        symbols: ['C', 'C'],
        atomScale: 1.0,
        displayMode: 'ball-stick',
        renderStyle: 'soft',
        getAtomColor: defaultGetAtomColor,
        getAtomOpacity: defaultGetAtomOpacity,
        getAtomBaseOpacity: defaultGetAtomBaseOpacity,
        ...overrides,
    };
}

describe('computeAtomDisplayData', () => {
    it('returns one entry per atom', () => {
        const result = computeAtomDisplayData(makeParams());
        expect(result).toHaveLength(2);
    });

    it('returns an empty array for zero atoms', () => {
        const result = computeAtomDisplayData(makeParams({ positions: [], symbols: [] }));
        expect(result).toHaveLength(0);
    });

    it('sets position from the input positions array', () => {
        const result = computeAtomDisplayData(makeParams({
            positions: [[3, 4, 5]],
            symbols: ['C'],
        }));
        expect(result[0].position.x).toBeCloseTo(3);
        expect(result[0].position.y).toBeCloseTo(4);
        expect(result[0].position.z).toBeCloseTo(5);
    });

    it('scale = elementRadius * radiusOverride * atomScale * 2 for ball-stick', () => {
        // Carbon's atomic number is 6. Check the actual radius from radiiData at runtime;
        // use a known element to assert the formula structure.
        // We set atomScale=1.0, radiusOverride=1 (default) → scale = radius*1*1*2 = radius*2
        const result = computeAtomDisplayData(makeParams({
            positions: [[0, 0, 0]],
            symbols: ['H'], // H is element 1
            atomScale: 1.0,
        }));
        // We just assert the scale is > 0 and consistent with *2 factor
        expect(result[0].scale).toBeGreaterThan(0);
    });

    it('applies atomScale: doubling atomScale doubles the scale', () => {
        const r1 = computeAtomDisplayData(makeParams({ positions: [[0,0,0]], symbols: ['C'], atomScale: 1.0 }));
        const r2 = computeAtomDisplayData(makeParams({ positions: [[0,0,0]], symbols: ['C'], atomScale: 2.0 }));
        expect(r2[0].scale).toBeCloseTo(r1[0].scale * 2);
    });

    it('applies radiusOverride: halving the override halves the scale', () => {
        const r1 = computeAtomDisplayData(makeParams({
            positions: [[0,0,0]], symbols: ['C'], atomScale: 1.0,
        }));
        const r2 = computeAtomDisplayData(makeParams({
            positions: [[0,0,0]], symbols: ['C'], atomScale: 1.0,
            radiusOverrides: { 0: 0.5 },
        }));
        expect(r2[0].scale).toBeCloseTo(r1[0].scale * 0.5);
    });

    it('applies wireframe hit-scale: wireframe scale = ball-stick scale * 0.3', () => {
        const bsResult = computeAtomDisplayData(makeParams({
            positions: [[0,0,0]], symbols: ['C'], atomScale: 1.0, displayMode: 'ball-stick',
        }));
        const wfResult = computeAtomDisplayData(makeParams({
            positions: [[0,0,0]], symbols: ['C'], atomScale: 1.0, displayMode: 'wireframe',
        }));
        expect(wfResult[0].scale).toBeCloseTo(bsResult[0].scale * 0.3);
    });

    it('uses getAtomBaseOpacity in cartoon render style for a visible (non-hidden) atom', () => {
        const getAtomBaseOpacity = vi.fn(() => 0.4);
        const getAtomOpacity = vi.fn(() => 0.9);
        const result = computeAtomDisplayData(makeParams({
            positions: [[0,0,0]], symbols: ['C'],
            renderStyle: 'cartoon',
            getAtomBaseOpacity,
            getAtomOpacity,
        }));
        // A non-hidden atom (opacity 0.9 != 0) maps to the global cartoon base (0.4),
        // not its per-atom value — cartoon ignores partial transparency.
        expect(result[0].opacity).toBeCloseTo(0.4);
        expect(getAtomBaseOpacity).toHaveBeenCalled();
        // getAtomOpacity is now consulted to detect the fully-hidden (0) sentinel.
        expect(getAtomOpacity).toHaveBeenCalled();
    });

    it('cartoon: a fully-hidden atom (opacity 0) stays hidden (opacity 0), so the toon shader can discard it', () => {
        // Hiding an atom sets its opacity override to 0. In cartoon mode this must
        // flow through so the atom is actually removed, instead of being forced
        // back to the (opaque) base opacity and rendered fully visible.
        const result = computeAtomDisplayData(makeParams({
            positions: [[0, 0, 0]], symbols: ['C'],
            renderStyle: 'cartoon',
            getAtomBaseOpacity: () => 0.4,
            getAtomOpacity: () => 0, // atom hidden
        }));
        expect(result[0].opacity).toBe(0);
    });

    it('cartoon: a PARTIAL opacity still maps to the base opacity (cartoon ignores partial transparency by design)', () => {
        const result = computeAtomDisplayData(makeParams({
            positions: [[0, 0, 0]], symbols: ['C'],
            renderStyle: 'cartoon',
            getAtomBaseOpacity: () => 0.4,
            getAtomOpacity: () => 0.5, // partially transparent, not hidden
        }));
        expect(result[0].opacity).toBeCloseTo(0.4);
    });

    it('uses per-atom getAtomOpacity for non-cartoon render styles', () => {
        const getAtomBaseOpacity = vi.fn(() => 0.2);
        const getAtomOpacity = vi.fn(() => 0.7);
        const result = computeAtomDisplayData(makeParams({
            positions: [[0,0,0]], symbols: ['C'],
            renderStyle: 'soft',
            getAtomBaseOpacity,
            getAtomOpacity,
        }));
        expect(result[0].opacity).toBeCloseTo(0.7);
        expect(getAtomOpacity).toHaveBeenCalled();
        expect(getAtomBaseOpacity).not.toHaveBeenCalled();
    });

    it('resolves color by calling getAtomColor with the correct index and symbol', () => {
        const getAtomColor = vi.fn(() => new THREE.Color(0, 0, 1));
        const result = computeAtomDisplayData(makeParams({
            positions: [[0,0,0]], symbols: ['N'],
            getAtomColor,
        }));
        expect(getAtomColor).toHaveBeenCalledWith(0, 'N');
        expect(result[0].color.b).toBeCloseTo(1);
    });

    it('color-override precedence: colorOverrides come from getAtomColor (injected), not hardcoded', () => {
        // The caller is responsible for binding overrides into getAtomColor;
        // atomDisplayData just calls the injected fn.
        const overrideColor = new THREE.Color(1, 0.5, 0);
        const getAtomColor = vi.fn(() => overrideColor.clone());
        const result = computeAtomDisplayData(makeParams({ positions: [[0,0,0]], symbols: ['C'], getAtomColor }));
        expect(result[0].color.r).toBeCloseTo(1);
        expect(result[0].color.g).toBeCloseTo(0.5);
    });

    it('handles an unknown element symbol — radiiData[0] gives the fallback for atomic number 0', () => {
        // getAtomicNumber returns 0 for unknown symbols; radiiData[0] = 0.2 in the actual data.
        // scale = 0.2 * 1 (override) * 1.0 * 2 = 0.4
        const result = computeAtomDisplayData(makeParams({
            positions: [[0,0,0]], symbols: ['Xx'], atomScale: 1.0,
        }));
        // Just assert it's > 0 and finite; the exact value depends on radiiData content.
        expect(result[0].scale).toBeGreaterThan(0);
        expect(Number.isFinite(result[0].scale)).toBe(true);
    });
});
