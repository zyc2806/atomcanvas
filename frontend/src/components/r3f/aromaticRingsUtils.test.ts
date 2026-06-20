import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
    getNearestAtomIndexToRing,
    aromaticInstancedMeshKey,
    applyAromaticRingInstances,
    resolveAromaticRingColor,
} from './aromaticRingsUtils';

describe('getNearestAtomIndexToRing', () => {
    it('returns null for an empty positions array', () => {
        expect(getNearestAtomIndexToRing([0, 0, 0], [])).toBeNull();
    });

    it('returns 0 for a single-atom array', () => {
        expect(getNearestAtomIndexToRing([0, 0, 0], [[1, 1, 1]])).toBe(0);
    });

    it('returns the index of the nearest atom', () => {
        const ringCenter: [number, number, number] = [0, 0, 0];
        const positions: [number, number, number][] = [
            [10, 0, 0], // far
            [1, 0, 0],  // nearest
            [5, 0, 0],  // middle
        ];
        expect(getNearestAtomIndexToRing(ringCenter, positions)).toBe(1);
    });

    it('works when the ring center is not at the origin', () => {
        const ringCenter: [number, number, number] = [3, 3, 3];
        const positions: [number, number, number][] = [
            [0, 0, 0],  // dist = sqrt(27)
            [3, 3, 4],  // dist = 1 ← nearest
            [10, 10, 10],
        ];
        expect(getNearestAtomIndexToRing(ringCenter, positions)).toBe(1);
    });

    it('resolves ties to the first (lower-index) atom', () => {
        const ringCenter: [number, number, number] = [0, 0, 0];
        // Both atoms are at equal distance (exactly 1 unit away on the X axis)
        const positions: [number, number, number][] = [
            [1, 0, 0],  // dist = 1
            [-1, 0, 0], // dist = 1
        ];
        // The loop uses strict "<", so the first minimum found at index 0 is kept on a tie
        expect(getNearestAtomIndexToRing(ringCenter, positions)).toBe(0);
    });

    it('considers all three coordinate components', () => {
        const ringCenter: [number, number, number] = [1, 1, 1];
        const positions: [number, number, number][] = [
            [2, 2, 2],  // dist = sqrt(3)
            [1, 1, 2],  // dist = 1 ← nearest
            [0, 0, 0],  // dist = sqrt(3)
        ];
        expect(getNearestAtomIndexToRing(ringCenter, positions)).toBe(1);
    });
});

// BUG 2: the aromatic-ring InstancedMesh leaked stale tori (floating in the new
// cell, often rendered black) when a 2nd structure was loaded. The mesh writes its
// per-instance matrices/colors imperatively in a useLayoutEffect and had NO remount
// key, so on a structure swap React reused the old mesh and any instance beyond the
// new ring count kept the previous structure's transform/color. The fix mounts the
// mesh under a structure-identity key so it is rebuilt fresh on every structure swap.
describe('aromaticInstancedMeshKey', () => {
    it('differs when the active structure (tab) changes, even at equal ring counts', () => {
        // The worst-case the count-only key (like Atoms key={count}) cannot catch:
        // two structures with the SAME number of rings.
        expect(aromaticInstancedMeshKey('tab-A', 3)).not.toBe(aromaticInstancedMeshKey('tab-B', 3));
    });

    it('differs when the ring count changes within the same structure', () => {
        // e.g. editing a structure so its aromatic-ring count changes; the buffer
        // must be reallocated to the new size.
        expect(aromaticInstancedMeshKey('tab-A', 3)).not.toBe(aromaticInstancedMeshKey('tab-A', 5));
    });

    it('is stable when neither the structure nor the ring count changes', () => {
        // Render-mode toggles (standard/soft/cartoon) must NOT remount the mesh —
        // renderStyle is intentionally not part of the key.
        expect(aromaticInstancedMeshKey('tab-A', 3)).toBe(aromaticInstancedMeshKey('tab-A', 3));
    });

    it('produces a stable string for a null/undefined tab id (no active tab yet)', () => {
        expect(aromaticInstancedMeshKey(null, 0)).toBe(aromaticInstancedMeshKey(null, 0));
        expect(typeof aromaticInstancedMeshKey(null, 0)).toBe('string');
        expect(typeof aromaticInstancedMeshKey(undefined, 2)).toBe('string');
    });
});

// BUG (vdw -> ball-stick/wireframe rings dislocate to the origin): the vdw display
// mode sets showBonds=false, which unmounts the ring InstancedMesh; switching back
// to ball-stick/wireframe sets showBonds=true and REMOUNTS it. A fresh InstancedMesh
// starts with IDENTITY instance matrices (every ring at the world origin, scale 1),
// so the matrices MUST be (re)written on remount. This writer is the extracted,
// GL-free-testable core; the component's effect must depend on showBonds so it runs.
function makeFakeMesh() {
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    return {
        matrices,
        colors,
        setMatrixAt(i: number, m: THREE.Matrix4) { matrices[i] = m.clone(); },
        setColorAt(i: number, c: THREE.Color) { colors[i] = c.clone(); },
        instanceMatrix: { needsUpdate: false },
        instanceColor: { needsUpdate: false } as { needsUpdate: boolean } | null,
    };
}

function decompose(m: THREE.Matrix4) {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    m.decompose(position, quaternion, scale);
    return { position, quaternion, scale };
}

describe('applyAromaticRingInstances', () => {
    it('writes one matrix + color per ring and flags both buffers for upload', () => {
        const rings = [
            { position: new THREE.Vector3(1, 2, 3), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(0.5, 0.5, 0.5), color: new THREE.Color(1, 0, 0) },
            { position: new THREE.Vector3(-4, 0, 2), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(2, 2, 2), color: new THREE.Color(0, 1, 0) },
        ];
        const mesh = makeFakeMesh();
        applyAromaticRingInstances(mesh, rings);

        expect(mesh.matrices.length).toBe(2);
        expect(mesh.colors.length).toBe(2);
        expect(mesh.instanceMatrix.needsUpdate).toBe(true);
        expect(mesh.instanceColor?.needsUpdate).toBe(true);

        const first = decompose(mesh.matrices[0]);
        expect(first.position.toArray()).toEqual([1, 2, 3]);
        expect(first.scale.x).toBeCloseTo(0.5);
    });

    it('REGRESSION: overwrites the identity transform a remounted mesh starts with (not origin/scale 1)', () => {
        // Reproduces the vdw->ball-stick symptom: a fresh InstancedMesh has identity
        // matrices (origin, scale 1); the writer must move/scale each ring to its place.
        const rings = [
            { position: new THREE.Vector3(5, 5, 5), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(3, 3, 3), color: new THREE.Color(0, 0, 1) },
        ];
        const mesh = makeFakeMesh();
        applyAromaticRingInstances(mesh, rings);

        const { position, scale } = decompose(mesh.matrices[0]);
        expect(position.length()).toBeGreaterThan(0); // NOT collapsed at the origin
        expect(scale.x).toBeCloseTo(3);               // NOT left at identity scale 1
    });

    it('writes nothing for an empty ring list', () => {
        const mesh = makeFakeMesh();
        applyAromaticRingInstances(mesh, []);
        expect(mesh.matrices.length).toBe(0);
        expect(mesh.colors.length).toBe(0);
    });
});

describe('resolveAromaticRingColor', () => {
    const CARBON_GREY = '#909090';
    // A base-color resolver: element color only, NO selection/fixed/override awareness.
    const getAtomBaseColor = (symbol: string): THREE.Color =>
        new THREE.Color(symbol === 'C' ? CARBON_GREY : '#ff0000');

    it('uses the nearest ring atom element base color', () => {
        const color = resolveAromaticRingColor(2, ['C', 'C', 'C'], getAtomBaseColor);
        expect(`#${color.getHexString()}`).toBe(CARBON_GREY);
    });

    it('falls back to carbon base color when there is no nearest atom', () => {
        const color = resolveAromaticRingColor(null, ['C'], getAtomBaseColor);
        expect(`#${color.getHexString()}`).toBe(CARBON_GREY);
    });

    it('falls back to carbon when the nearest atom has no symbol', () => {
        const color = resolveAromaticRingColor(5, ['C', 'C'], getAtomBaseColor);
        expect(`#${color.getHexString()}`).toBe(CARBON_GREY);
    });

    it('REGRESSION (BUG 3 torus): never the selection color, even for the nearest atom', () => {
        // The torus must come from getAtomBaseColor (element color), never the
        // selection-aware getAtomColor (#ffff00). Selecting the ring's nearest atom
        // must NOT yellow the torus. The signature accepts only getAtomBaseColor, so
        // a selection color is structurally unreachable here.
        const color = resolveAromaticRingColor(0, ['C'], getAtomBaseColor);
        expect(color.getHexString()).not.toBe('ffff00');
        expect(`#${color.getHexString()}`).toBe(CARBON_GREY);
    });
});
