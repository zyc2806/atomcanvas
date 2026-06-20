import * as THREE from 'three';

/** The per-instance data the aromatic-ring InstancedMesh writer needs. */
export interface AromaticRingInstance {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
    color: THREE.Color;
}

/** Minimal slice of THREE.InstancedMesh that the writer touches (GL-free testable). */
export interface AromaticInstanceTarget {
    setMatrixAt(index: number, matrix: THREE.Matrix4): void;
    setColorAt(index: number, color: THREE.Color): void;
    instanceMatrix: { needsUpdate: boolean };
    instanceColor: { needsUpdate: boolean } | null;
}

/**
 * Write per-instance transforms + colors into the aromatic-ring InstancedMesh.
 *
 * Extracted from AromaticRings so the imperative write is unit-testable without a
 * GL context. CRITICAL: a freshly (re)mounted InstancedMesh starts with IDENTITY
 * instance matrices — every ring at the world origin, scale 1 — NOT zeros. So this
 * MUST run on every (re)mount. The mesh remounts whenever it toggles in/out of the
 * tree, including when `showBonds` flips (the vdw display mode sets showBonds=false,
 * ball-stick/wireframe set it back to true), which is why the calling effect lists
 * `showBonds` in its deps — otherwise the remounted rings stay stuck at the origin.
 */
export function applyAromaticRingInstances(
    mesh: AromaticInstanceTarget,
    rings: readonly AromaticRingInstance[],
): void {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        dummy.position.copy(ring.position);
        dummy.quaternion.copy(ring.quaternion);
        dummy.scale.copy(ring.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, ring.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * Remount key for the aromatic-ring InstancedMesh.
 *
 * The mesh writes its per-instance matrices/colors imperatively (setMatrixAt /
 * setColorAt in a useLayoutEffect), and in this React-Three-Fiber version a change
 * to `args` alone does NOT reconstruct an InstancedMesh — only a changed React `key`
 * does. Without a key, loading a second structure reuses the old mesh: any instance
 * beyond the new ring count keeps the previous structure's transform/color, so stale
 * tori float in the new cell (and a zeroed instanceColor renders them black).
 *
 * Keying on the structure identity (active tab id) AND the ring count rebuilds the
 * mesh fresh on every structure swap and on any ring-count change, while leaving
 * render-mode toggles (renderStyle) untouched so they don't pay the remount cost.
 */
export const aromaticInstancedMeshKey = (
    activeTabId: string | null | undefined,
    ringCount: number,
): string => `${activeTabId ?? 'none'}-${ringCount}`;

export const getNearestAtomIndexToRing = (
    ringCenter: readonly [number, number, number],
    positions: [number, number, number][],
): number | null => {
    if (!positions || positions.length === 0) return null;

    let nearestIndex = 0;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;

    for (let index = 0; index < positions.length; index += 1) {
        const [x, y, z] = positions[index];
        const dx = x - ringCenter[0];
        const dy = y - ringCenter[1];
        const dz = z - ringCenter[2];
        const distanceSq = dx * dx + dy * dy + dz * dz;

        if (distanceSq < nearestDistanceSq) {
            nearestDistanceSq = distanceSq;
            nearestIndex = index;
        }
    }

    return nearestIndex;
};

/**
 * Resolve the display color of an aromatic-ring torus.
 *
 * The torus tracks the nearest ring atom's ELEMENT BASE color only. It must NOT use
 * the selection-aware getAtomColor: that returns #ffff00 for a selected atom, so
 * selecting a ring atom (or the atom nearest the ring center) would tint the whole
 * torus yellow and make the aromatic ring look "selected" — the BUG 3 torus gap.
 * Selection / fixed / per-atom-override states belong to the atoms, not the ring
 * indicator. The signature accepts ONLY getAtomBaseColor so selection-awareness
 * cannot be reintroduced here by accident.
 */
export const resolveAromaticRingColor = (
    nearestAtomIndex: number | null,
    symbols: string[],
    getAtomBaseColor: (symbol: string) => THREE.Color,
): THREE.Color =>
    nearestAtomIndex !== null && symbols[nearestAtomIndex]
        ? getAtomBaseColor(symbols[nearestAtomIndex])
        : getAtomBaseColor('C');
