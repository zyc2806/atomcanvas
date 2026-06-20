import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { syncMaterialAlphaHash } from './materialUpdate';

// AlphaHashMaterial is an unexported internal type; we duck-type it with a
// plain object and use `unknown` casts so TS is satisfied without importing THREE.
type AlphaHashMaterialLike = THREE.Material & {
  alphaHash: boolean;
  userData: Record<string, unknown>;
};

function makeMaterial(initialAlphaHash: boolean, initialNeedsUpdate = false) {
    return {
        alphaHash: initialAlphaHash,
        needsUpdate: initialNeedsUpdate,
        userData: {} as Record<string, unknown>,
    } as unknown as AlphaHashMaterialLike;
}

describe('syncMaterialAlphaHash', () => {
    it('is a no-op on null', () => {
        // Must not throw; no observable side-effect
        expect(() => syncMaterialAlphaHash(null, true)).not.toThrow();
        expect(() => syncMaterialAlphaHash(undefined, false)).not.toThrow();
    });

    it('sets alphaHash on the material', () => {
        const mat = makeMaterial(false);
        syncMaterialAlphaHash(mat, true);
        expect(mat.alphaHash).toBe(true);
    });

    it('persists the new state in userData so the next call can compare', () => {
        const mat = makeMaterial(false);
        syncMaterialAlphaHash(mat, true);
        // The key is an internal detail; we verify the round-trip effect:
        // if we call again with the same value, needsUpdate is NOT set again.
        mat.needsUpdate = false;
        syncMaterialAlphaHash(mat, true); // same value → no change
        expect(mat.needsUpdate).toBe(false);
    });

    it('sets needsUpdate=true when the bool actually changed', () => {
        const mat = makeMaterial(false);
        // First call: prime the prior state
        syncMaterialAlphaHash(mat, false);
        mat.needsUpdate = false; // reset

        // Second call: value changed false → true
        syncMaterialAlphaHash(mat, true);
        expect(mat.needsUpdate).toBe(true);
    });

    it('does NOT set needsUpdate when the value did not change', () => {
        const mat = makeMaterial(false);
        syncMaterialAlphaHash(mat, true); // set state to true
        mat.needsUpdate = false;

        syncMaterialAlphaHash(mat, true); // same value again
        expect(mat.needsUpdate).toBe(false);
    });

    it('first call with no prior state does not spuriously set needsUpdate', () => {
        // userData is empty → previousAlphaHash is undefined → typeof check fails →
        // no needsUpdate flip
        const mat = makeMaterial(false);
        syncMaterialAlphaHash(mat, false);
        expect(mat.needsUpdate).toBe(false);
    });

    it('first call with no prior state, value true, does not set needsUpdate', () => {
        const mat = makeMaterial(false);
        syncMaterialAlphaHash(mat, true);
        // No prior state → needsUpdate must NOT have been forced to true
        expect(mat.needsUpdate).toBe(false);
    });

    it('toggles needsUpdate on each real change (false→true→false)', () => {
        const mat = makeMaterial(false);
        syncMaterialAlphaHash(mat, false); // prime
        mat.needsUpdate = false;

        syncMaterialAlphaHash(mat, true);  // change 1
        expect(mat.needsUpdate).toBe(true);
        mat.needsUpdate = false;

        syncMaterialAlphaHash(mat, false); // change 2
        expect(mat.needsUpdate).toBe(true);
    });
});
