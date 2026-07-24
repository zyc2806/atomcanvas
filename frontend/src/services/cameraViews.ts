/**
 * cameraViews.ts
 *
 * Resolves a declarative "put the camera here" request into a concrete
 * CameraSnapshot. This is the geometry half of the headless `render --view`
 * feature: the CLI owns the *grammar* (`top`, `-c`, `1 1 1`, …) and hands over a
 * normalized spec; this module owns the *geometry* (lattice → world, framing
 * distance, up-vector choice), because only the browser has the structure's
 * cell and bounding sphere.
 *
 * Pure: no React, no Zustand, no GL context.
 */
import { computeFitBounds, computeFramingDistance } from '../components/r3f/fitBounds';

export type Vec3 = [number, number, number];

/** Reference frame a `direction` is expressed in. */
export type ViewFrame = 'cartesian' | 'lattice';

export interface CameraViewSpec {
    /** Direction from the target *towards* the camera. */
    direction?: Vec3;
    /** How to read `direction`. 'lattice' means h·a + k·b + l·c. Default 'cartesian'. */
    frame?: ViewFrame;
    /** Explicit up vector. When omitted, one is chosen (see `autoUp`). */
    up?: Vec3;
    /** Absolute camera position; wins over `direction` (no framing applied). */
    position?: Vec3;
    /** Look-at point. Defaults to the structure centroid. */
    target?: Vec3;
    /** Orthographic zoom. Defaults to 1 (which lets the viewer derive a fitting zoom). */
    zoom?: number;
}

export interface ResolvedCameraView {
    position: Vec3;
    target: Vec3;
    up: Vec3;
    zoom: number;
}

const EPS = 1e-9;

function norm(v: Vec3): number {
    return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: Vec3): Vec3 | null {
    const n = norm(v);
    if (!Number.isFinite(n) || n < EPS) return null;
    return [v[0] / n, v[1] / n, v[2] / n];
}

function isFiniteVec(v: unknown): v is Vec3 {
    return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** A 3×3 cell whose rows are the lattice vectors a, b, c — and which is not degenerate. */
function usableCell(cell: number[][] | null | undefined): number[][] | null {
    if (!cell || cell.length !== 3) return null;
    if (!cell.every((row) => Array.isArray(row) && row.length === 3 && row.every((n) => Number.isFinite(n)))) return null;
    if (!cell.some((row) => row.some((n) => n !== 0))) return null;
    return cell;
}

/**
 * Converts a lattice direction [h k l] to world coordinates: h·a + k·b + l·c.
 * Returns the input unchanged when the structure has no usable cell, so
 * `--view "1 1 1"` still means something sensible for a molecule.
 */
export function latticeToWorld(direction: Vec3, cell: number[][] | null | undefined): Vec3 {
    const c = usableCell(cell);
    if (!c) return direction;
    const [h, k, l] = direction;
    return [
        h * c[0][0] + k * c[1][0] + l * c[2][0],
        h * c[0][1] + k * c[1][1] + l * c[2][1],
        h * c[0][2] + k * c[1][2] + l * c[2][2],
    ];
}

/**
 * Picks an up vector for a view direction.
 *
 * World +z is the "vertical" for crystal/slab work (a side view of a slab must
 * put the surface normal up), so +z wins whenever it is not itself the view
 * direction; looking down z falls back to +y, which reproduces the viewer's
 * default orientation. `--view top` and `--view z` therefore agree.
 */
export function autoUp(direction: Vec3): Vec3 {
    const d = normalize(direction);
    if (!d) return [0, 1, 0];
    return Math.abs(d[2]) < 0.95 ? [0, 0, 1] : [0, 1, 0];
}

export interface ResolveCameraViewInput {
    spec: CameraViewSpec;
    /** Positions actually drawn (wrapped basis) — used for centroid + bounding radius. */
    positions: [number, number, number][] | null | undefined;
    cell?: number[][] | null;
    /** Camera vertical FOV in degrees; used for the framing distance. */
    fovDeg?: number;
}

/**
 * Turns a spec into concrete camera placement, or null when the spec cannot be
 * honoured (no direction and no position, or a degenerate direction).
 */
export function resolveCameraView({
    spec,
    positions,
    cell,
    fovDeg,
}: ResolveCameraViewInput): ResolvedCameraView | null {
    const { center, radius } = computeFitBounds(positions ?? undefined);
    const target: Vec3 = isFiniteVec(spec.target) ? spec.target : center;

    let position: Vec3;
    if (isFiniteVec(spec.position)) {
        position = spec.position;
    } else if (isFiniteVec(spec.direction)) {
        const world = spec.frame === 'lattice' ? latticeToWorld(spec.direction, cell) : spec.direction;
        const dir = normalize(world);
        if (!dir) return null;
        const distance = computeFramingDistance(radius, fovDeg);
        position = [
            target[0] + dir[0] * distance,
            target[1] + dir[1] * distance,
            target[2] + dir[2] * distance,
        ];
    } else {
        return null;
    }

    const viewDir: Vec3 = [position[0] - target[0], position[1] - target[1], position[2] - target[2]];
    if (!normalize(viewDir)) return null; // camera sitting exactly on its target

    let up = isFiniteVec(spec.up) ? normalize(spec.up) : null;
    if (up) {
        // A user-supplied up parallel to the view direction gives a degenerate
        // basis (three.js would produce NaNs); fall back rather than break.
        const d = normalize(viewDir)!;
        if (Math.abs(up[0] * d[0] + up[1] * d[1] + up[2] * d[2]) > 0.999) up = null;
    }

    const zoom = typeof spec.zoom === 'number' && Number.isFinite(spec.zoom) && spec.zoom > 0 ? spec.zoom : 1;

    return { position, target, up: up ?? autoUp(viewDir), zoom };
}
