/**
 * fitBounds.ts
 *
 * Pure helpers extracted from ViewerCanvas.tsx:
 *   - computeFitBounds: derives the centroid + bounding radius of a structure
 *   - computeFramingDistance: converts bounding radius → camera distance
 *
 * No React, no Zustand, no GL context required.
 */

export interface FitBoundsResult {
    center: [number, number, number];
    radius: number | undefined;
}

/**
 * Computes the centroid (mean of all positions) and bounding radius (max
 * distance from centroid to any atom) of a set of atom positions.
 *
 * Exact port of the `fitCenter`/`fitRadius` useMemo from ViewerCanvas.tsx.
 *
 * @param positions - Atom positions; may be empty or undefined.
 * @param fallbackCenter - Returned as `center` when positions is empty/absent.
 */
export function computeFitBounds(
    positions: [number, number, number][] | null | undefined,
    fallbackCenter: [number, number, number] = [0, 0, 0],
): FitBoundsResult {
    if (!positions || positions.length === 0) {
        return { center: fallbackCenter, radius: undefined };
    }

    let cx = 0, cy = 0, cz = 0;
    for (const p of positions) {
        cx += p[0];
        cy += p[1];
        cz += p[2];
    }
    const n = positions.length;
    cx /= n;
    cy /= n;
    cz /= n;

    let r = 0;
    for (const p of positions) {
        r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
    }

    return { center: [cx, cy, cz] as [number, number, number], radius: r };
}

// The minimum camera distance used in CameraController (hardcoded to 3).
const MIN_CAMERA_DISTANCE = 3;

// The margin factor applied to the bounding radius (1.6× to give visual breathing room).
const FRAME_MARGIN = 1.6;

// The floor applied to the bounding radius before computing distance.
const MIN_RADIUS_FLOOR = 0.8;

/**
 * Converts a bounding radius + camera FOV into the camera distance needed to
 * fit the structure in the viewport.
 *
 * Exact port of the framing formula from CameraController in ViewerCanvas.tsx:
 *   const radius = Math.max(fitRadius ?? 0, 0.8);
 *   const halfFov = (fovDeg * Math.PI) / 180 / 2;
 *   const dist = Math.max((radius * 1.6) / Math.sin(halfFov), 3);
 *
 * @param radius  - Bounding radius (may be undefined → treated as 0).
 * @param fovDeg  - Camera vertical field-of-view in degrees.
 *                  For non-perspective cameras (undefined/0/NaN) falls back to 50°.
 */
export function computeFramingDistance(
    radius: number | undefined,
    fovDeg: number | undefined,
): number {
    const effectiveRadius = Math.max(radius ?? 0, MIN_RADIUS_FLOOR);
    const effectiveFov = (fovDeg !== undefined && Number.isFinite(fovDeg) && fovDeg > 0) ? fovDeg : 50;
    const halfFov = (effectiveFov * Math.PI) / 180 / 2;
    return Math.max((effectiveRadius * FRAME_MARGIN) / Math.sin(halfFov), MIN_CAMERA_DISTANCE);
}
