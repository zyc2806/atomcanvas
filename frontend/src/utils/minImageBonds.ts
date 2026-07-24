/**
 * minImageBonds.ts
 *
 * Minimum-image bond splitting for trajectory playback.
 *
 * Static structures get their cross-boundary bonds turned into stubs by the
 * backend (`wrapped_ghost_bonds`), computed once against the wrapped basis.
 * Trajectory frames cannot use that: playback never calls the backend, and it
 * renders every frame from that frame's RAW positions with the frame-0 topology
 * (see `selectFramePositions`). For a WRAPPED trajectory — which is what
 * XDATCAR and most LAMMPS dumps contain — a bonded pair that straddles the cell
 * boundary then sits on opposite sides of the box, and drawing it directly
 * produces a line straight across the cell: the long, wrong bond.
 *
 * This module re-derives the split per frame, in the same shape the ghost-stub
 * renderer already consumes, so playback shows the same visual language as the
 * static view. Pure: no React, no store, no backend call.
 */

type Vec3 = [number, number, number];
type BondTuple = [number, number, number?] | [number, number];

/** Same tuple the backend emits: [start, end, atomIdx, otherIdx, order]. */
export type GhostStub = [Vec3, Vec3, number, number, number];

export interface SplitBondsInput {
    positions: Vec3[];
    bonds: BondTuple[];
    cell?: number[][] | null;
    pbc?: [boolean, boolean, boolean] | boolean[] | null;
}

export interface SplitBondsResult {
    bonds: BondTuple[];
    ghostBonds: GhostStub[];
}

/**
 * A bond counts as crossing the boundary when drawing it directly would be this
 * much longer than the true minimum-image contact. Comfortably above numerical
 * noise, far below a full lattice vector — the two cases are separated by
 * roughly a cell length, so the exact value is not delicate.
 */
const CROSSING_TOLERANCE = 0.05;

/** Fraction of the true bond length each stub sticks out of its atom. */
const STUB_FRACTION = 0.5;

function usableCell(cell: number[][] | null | undefined): number[][] | null {
    if (!cell || cell.length !== 3) return null;
    if (!cell.every((row) => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) return null;
    if (!cell.some((row) => row.some((n) => n !== 0))) return null;
    return cell;
}

function invert3(m: number[][]): number[][] | null {
    const [a, b, c] = m;
    const det =
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]);
    if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
    const d = 1 / det;
    return [
        [(b[1] * c[2] - b[2] * c[1]) * d, (a[2] * c[1] - a[1] * c[2]) * d, (a[1] * b[2] - a[2] * b[1]) * d],
        [(b[2] * c[0] - b[0] * c[2]) * d, (a[0] * c[2] - a[2] * c[0]) * d, (a[2] * b[0] - a[0] * b[2]) * d],
        [(b[0] * c[1] - b[1] * c[0]) * d, (a[1] * c[0] - a[0] * c[1]) * d, (a[0] * b[1] - a[1] * b[0]) * d],
    ];
}

/**
 * The shortest vector equivalent to `delta` under the cell's periodicity.
 *
 * Searches the 27 neighbouring images rather than just rounding the fractional
 * offset: for a strongly skewed (triclinic) cell, rounding alone can miss the
 * true minimum image.
 */
export function minimumImageVector(
    delta: Vec3,
    cell: number[][],
    inv: number[][],
    periodic: boolean[],
): Vec3 {
    const frac = [
        delta[0] * inv[0][0] + delta[1] * inv[1][0] + delta[2] * inv[2][0],
        delta[0] * inv[0][1] + delta[1] * inv[1][1] + delta[2] * inv[2][1],
        delta[0] * inv[0][2] + delta[1] * inv[1][2] + delta[2] * inv[2][2],
    ];
    const base = frac.map((f, i) => (periodic[i] ? f - Math.round(f) : f));

    let best: Vec3 = delta;
    let bestLen = Infinity;
    const span = (i: number) => (periodic[i] ? [-1, 0, 1] : [0]);
    for (const di of span(0)) {
        for (const dj of span(1)) {
            for (const dk of span(2)) {
                const f0 = base[0] + di;
                const f1 = base[1] + dj;
                const f2 = base[2] + dk;
                const v: Vec3 = [
                    f0 * cell[0][0] + f1 * cell[1][0] + f2 * cell[2][0],
                    f0 * cell[0][1] + f1 * cell[1][1] + f2 * cell[2][1],
                    f0 * cell[0][2] + f1 * cell[1][2] + f2 * cell[2][2],
                ];
                const l = Math.hypot(v[0], v[1], v[2]);
                if (l < bestLen) {
                    bestLen = l;
                    best = v;
                }
            }
        }
    }
    return best;
}

/**
 * Splits a frame's bonds into ones that can be drawn directly and ones that
 * cross the periodic boundary (returned as a pair of stubs, one per atom).
 *
 * Returns the input unchanged when the structure has no usable cell or no
 * periodic direction, so molecules and unwrapped trajectories are unaffected.
 */
export function splitBondsByMinimumImage({
    positions,
    bonds,
    cell,
    pbc,
}: SplitBondsInput): SplitBondsResult {
    const c = usableCell(cell);
    const periodic = [0, 1, 2].map((i) => (pbc ? pbc[i] !== false : true));
    if (!c || !periodic.some(Boolean)) return { bonds, ghostBonds: [] };

    const inv = invert3(c);
    if (!inv) return { bonds, ghostBonds: [] };

    const kept: BondTuple[] = [];
    const ghostBonds: GhostStub[] = [];

    for (const bond of bonds) {
        const u = bond[0];
        const v = bond[1];
        const order = (bond[2] as number | undefined) ?? 1;
        const pu = positions[u];
        const pv = positions[v];
        if (!pu || !pv) continue; // stale topology vs a shorter frame

        const delta: Vec3 = [pv[0] - pu[0], pv[1] - pu[1], pv[2] - pu[2]];
        const drawn = Math.hypot(delta[0], delta[1], delta[2]);
        const mi = minimumImageVector(delta, c, inv, periodic);
        const trueLen = Math.hypot(mi[0], mi[1], mi[2]);

        if (drawn - trueLen <= CROSSING_TOLERANCE) {
            kept.push(bond);
            continue;
        }

        // Crosses the boundary: each atom gets a stub pointing at where its
        // partner really is, so neither the false long line nor a bare gap.
        const s = STUB_FRACTION;
        ghostBonds.push([
            [pu[0], pu[1], pu[2]],
            [pu[0] + mi[0] * s, pu[1] + mi[1] * s, pu[2] + mi[2] * s],
            u, v, order,
        ]);
        ghostBonds.push([
            [pv[0], pv[1], pv[2]],
            [pv[0] - mi[0] * s, pv[1] - mi[1] * s, pv[2] - mi[2] * s],
            v, u, order,
        ]);
    }

    return { bonds: kept, ghostBonds };
}
