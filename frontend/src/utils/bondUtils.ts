import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const EPSILON = 1e-6;
const DEFAULT_MIN_CLIPPED_BOND_LENGTH = 0.02;

export interface ClippedBondSegment {
    start: [number, number, number];
    end: [number, number, number];
}

/**
 * Calculates position, rotation (quaternion), and scale (height) for a cylinder
 * connecting two points. The cylinder assumes default Y-axis alignment.
 */
export const calculateBondTransform = (
    start: [number, number, number], 
    end: [number, number, number]
): { position: THREE.Vector3, quaternion: THREE.Quaternion, scale: number } => {
    const vStart = new THREE.Vector3(...start);
    const vEnd = new THREE.Vector3(...end);
    
    // Position is midpoint
    const position = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);
    
    // Scale is distance
    const distance = vStart.distanceTo(vEnd);
    
    // Rotation: align Y-axis to vector (end - start)
    const direction = new THREE.Vector3().subVectors(vEnd, vStart).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction);
    
    return {
        position,
        quaternion,
        scale: distance
    };
};

/**
 * Returns the scale factor for the bond radius based on the elements involved.
 * Hydrogen bonds are typically thinner for better visual clarity.
 */
export const getBondRadiusScale = (symbol1: string, symbol2: string): number => {
    if (symbol1 === 'H' || symbol2 === 'H') {
        return 0.6;
    }
    return 1.0;
};

const WIREFRAME_HIT_SCALE = 0.3;

export const getRenderedAtomRadius = (
    elementRadius: number,
    atomScale: number,
    displayMode: 'ball-stick' | 'vdw' | 'wireframe',
    // Per-atom / per-element radius override (e.g. the Size slider). Must be
    // folded into the rendered radius so bonds trim to the *shrunken* atom
    // surface; otherwise the cylinder floats with a visible gap (issue #1).
    radiusOverride = 1
): number => {
    const modeScale = displayMode === 'wireframe' ? WIREFRAME_HIT_SCALE : 1;
    return elementRadius * radiusOverride * atomScale * modeScale;
};

export const getBondSurfaceTrim = (
    atomRadius: number,
    offsetLengthSq: number,
    displayMode: 'ball-stick' | 'vdw' | 'wireframe'
): number => {
    if (displayMode === 'wireframe') return 0;
    return Math.sqrt(Math.max(0, atomRadius * atomRadius - offsetLengthSq));
};

/**
 * Clips a bond segment so it starts/ends at atom surfaces rather than atom centers.
 * Returns null when the clipped segment is too short to render reliably.
 */
export const clipBondToAtomSurfaces = (
    start: [number, number, number],
    end: [number, number, number],
    startTrim: number,
    endTrim: number,
    minLength = DEFAULT_MIN_CLIPPED_BOND_LENGTH
): ClippedBondSegment | null => {
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);
    const direction = new THREE.Vector3().subVectors(endVec, startVec);
    const distance = direction.length();

    if (distance <= EPSILON) return null;

    direction.multiplyScalar(1 / distance);

    let trimFromStart = Math.max(0, startTrim);
    let trimFromEnd = Math.max(0, endTrim);

    const totalTrim = trimFromStart + trimFromEnd;
    const maxAllowedTrim = Math.max(0, distance - minLength);

    if (totalTrim > maxAllowedTrim && totalTrim > EPSILON) {
        const scale = maxAllowedTrim / totalTrim;
        trimFromStart *= scale;
        trimFromEnd *= scale;
    }

    startVec.addScaledVector(direction, trimFromStart);
    endVec.addScaledVector(direction, -trimFromEnd);

    if (startVec.distanceTo(endVec) + EPSILON < minLength) {
        return null;
    }

    return {
        start: [startVec.x, startVec.y, startVec.z],
        end: [endVec.x, endVec.y, endVec.z],
    };
};

export const clipGhostBondFromAtomToBoundary = (
    start: [number, number, number],
    end: [number, number, number],
    atomTrim: number,
    minLength = DEFAULT_MIN_CLIPPED_BOND_LENGTH
): ClippedBondSegment | null => {
    return clipBondToAtomSurfaces(start, end, atomTrim, 0, minLength);
};
