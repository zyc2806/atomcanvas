/**
 * Trajectory cross-boundary bond regression.
 *
 * BUG: a multi-frame trajectory is rendered from each frame's RAW positions
 * with the frame-0 topology, and the backend's wrapped-basis ghost stubs do not
 * apply to it. For a WRAPPED trajectory (XDATCAR, most LAMMPS dumps) a bonded
 * pair straddling the cell boundary sits on opposite sides of the box, so the
 * bond was drawn as a straight line across the whole cell — the long, wrong
 * bond. Frame 0 of an already-wrapped input looks fine, which is why a static
 * render never showed it.
 *
 * The invariant: at EVERY trajectory frame, no bond may be drawn appreciably
 * longer than the true minimum-image distance between its two atoms.
 */
import { describe, it, expect } from 'vitest';
import { splitBondsByMinimumImage, minimumImageVector } from '../../utils/minImageBonds';

type Vec3 = [number, number, number];

const A = 5.64;
const CELL = [[2 * A, 0, 0], [0, 2 * A, 0], [0, 0, 2 * A]];
const PBC: [boolean, boolean, boolean] = [true, true, true];

const INV = [[1 / (2 * A), 0, 0], [0, 1 / (2 * A), 0], [0, 0, 1 / (2 * A)]];

/** A rocksalt-like lattice, then translated and WRAPPED — a wrapped MD frame. */
function wrappedFrame(shift: number): Vec3[] {
    const out: Vec3[] = [];
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            for (let k = 0; k < 4; k++) {
                const p: Vec3 = [
                    (i * A) / 2 + shift * A,
                    (j * A) / 2 + shift * 0.6 * A,
                    (k * A) / 2,
                ];
                out.push(p.map((c) => ((c % (2 * A)) + 2 * A) % (2 * A)) as Vec3);
            }
        }
    }
    return out;
}

/** Frame-0 topology: nearest-neighbour pairs under the minimum image. */
function frameZeroBonds(positions: Vec3[]): [number, number, number][] {
    const bonds: [number, number, number][] = [];
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const d: Vec3 = [
                positions[j][0] - positions[i][0],
                positions[j][1] - positions[i][1],
                positions[j][2] - positions[i][2],
            ];
            const mi = minimumImageVector(d, CELL, INV, [true, true, true]);
            if (Math.hypot(...mi) < A / 2 + 0.1) bonds.push([i, j, 1]);
        }
    }
    return bonds;
}

function worstExcess(positions: Vec3[], bonds: [number, number, number][]): number {
    let worst = 0;
    for (const [u, v] of bonds) {
        const d: Vec3 = [
            positions[v][0] - positions[u][0],
            positions[v][1] - positions[u][1],
            positions[v][2] - positions[u][2],
        ];
        const drawn = Math.hypot(...d);
        const trueLen = Math.hypot(...minimumImageVector(d, CELL, INV, [true, true, true]));
        worst = Math.max(worst, drawn - trueLen);
    }
    return worst;
}

describe('trajectory playback across a periodic boundary', () => {
    const frames = [0, 0.31, 0.62, 0.93].map(wrappedFrame);
    const topology = frameZeroBonds(frames[0]);

    it('the raw frames really do contain cell-spanning pairs (guards the test itself)', () => {
        // Without the fix these frames are what produced the long bonds; if this
        // ever stops holding, the regression below would pass vacuously.
        const spanning = frames.slice(1).map((f) => worstExcess(f, topology));
        expect(Math.max(...spanning)).toBeGreaterThan(A);
    });

    it('draws no cell-spanning bond at any frame', () => {
        for (const [i, positions] of frames.entries()) {
            const { bonds } = splitBondsByMinimumImage({ positions, bonds: topology, cell: CELL, pbc: PBC });
            expect(worstExcess(positions, bonds as [number, number, number][]),
                `frame ${i} still draws a bond across the cell`).toBeLessThan(0.06);
        }
    });

    it('replaces each crossing bond with two stubs rather than dropping it', () => {
        const positions = frames[3];
        const { bonds, ghostBonds } = splitBondsByMinimumImage({
            positions, bonds: topology, cell: CELL, pbc: PBC,
        });
        const crossings = topology.length - bonds.length;
        expect(crossings).toBeGreaterThan(0);
        expect(ghostBonds).toHaveLength(crossings * 2);
    });

    it('keeps every stub short — no stub is itself a cell-spanning line', () => {
        const positions = frames[2];
        const { ghostBonds } = splitBondsByMinimumImage({
            positions, bonds: topology, cell: CELL, pbc: PBC,
        });
        for (const [start, end] of ghostBonds) {
            const l = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
            expect(l).toBeLessThan(A / 2);
        }
    });

    it('treats frame 0 the same way the static view does', () => {
        // Frame 0's own topology already contains pairs that bond THROUGH the
        // boundary, so they must become stubs here exactly as the backend's
        // wrapped_ghost_bonds render them in the static view — not stay as
        // lines across the cell, and not silently vanish.
        const { bonds, ghostBonds } = splitBondsByMinimumImage({
            positions: frames[0], bonds: topology, cell: CELL, pbc: PBC,
        });
        expect(bonds.length).toBeLessThan(topology.length);
        expect(ghostBonds).toHaveLength((topology.length - bonds.length) * 2);
        expect(worstExcess(frames[0], bonds as [number, number, number][])).toBeLessThan(0.06);
    });

    it('every atom keeps its bonding partners — no bond is silently dropped', () => {
        const positions = frames[3];
        const { bonds, ghostBonds } = splitBondsByMinimumImage({
            positions, bonds: topology, cell: CELL, pbc: PBC,
        });
        const seen = new Set<string>();
        for (const [u, v] of bonds) seen.add(`${Math.min(u, v)}-${Math.max(u, v)}`);
        for (const g of ghostBonds) seen.add(`${Math.min(g[2], g[3])}-${Math.max(g[2], g[3])}`);
        const expected = new Set(topology.map(([u, v]) => `${Math.min(u, v)}-${Math.max(u, v)}`));
        expect(seen).toEqual(expected);
    });
});
