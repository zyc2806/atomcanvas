import { describe, it, expect } from 'vitest';
import { splitBondsByMinimumImage } from './minImageBonds';

type Vec3 = [number, number, number];

const CUBE = [[10, 0, 0], [0, 10, 0], [0, 0, 10]];
const PBC: [boolean, boolean, boolean] = [true, true, true];

const len = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

describe('splitBondsByMinimumImage', () => {
    it('keeps an ordinary in-cell bond as a regular bond', () => {
        const positions: Vec3[] = [[5, 5, 5], [6.5, 5, 5]];
        const out = splitBondsByMinimumImage({ positions, bonds: [[0, 1, 1]], cell: CUBE, pbc: PBC });
        expect(out.bonds).toEqual([[0, 1, 1]]);
        expect(out.ghostBonds).toEqual([]);
    });

    it('demotes a boundary-straddling pair to stubs instead of a cell-spanning line', () => {
        // 0.5 Å from one face, 0.5 Å from the opposite face: 1 Å apart through the
        // boundary, but 9 Å apart if drawn directly.
        const positions: Vec3[] = [[9.5, 5, 5], [0.5, 5, 5]];
        const out = splitBondsByMinimumImage({ positions, bonds: [[0, 1, 1]], cell: CUBE, pbc: PBC });
        expect(out.bonds).toEqual([]);
        expect(out.ghostBonds).toHaveLength(2);

        // Every stub must be far shorter than the naive 9 Å line.
        for (const [start, end] of out.ghostBonds) {
            expect(len(start as Vec3, end as Vec3)).toBeLessThan(1);
        }
    });

    it('anchors each stub at the atom it belongs to and points it out of the cell', () => {
        const positions: Vec3[] = [[9.5, 5, 5], [0.5, 5, 5]];
        const { ghostBonds } = splitBondsByMinimumImage({
            positions, bonds: [[0, 1, 1]], cell: CUBE, pbc: PBC,
        });

        const forAtom0 = ghostBonds.find((g) => g[2] === 0)!;
        const forAtom1 = ghostBonds.find((g) => g[2] === 1)!;
        expect(forAtom0[0]).toEqual([9.5, 5, 5]);
        expect(forAtom1[0]).toEqual([0.5, 5, 5]);
        // atom 0 sits near +x and its partner is across that face, so its stub
        // must run towards +x (and atom 1's towards -x).
        expect((forAtom0[1] as Vec3)[0]).toBeGreaterThan(9.5);
        expect((forAtom1[1] as Vec3)[0]).toBeLessThan(0.5);
        expect(forAtom0[3]).toBe(1);
        expect(forAtom1[3]).toBe(0);
    });

    it('carries the bond order onto both stubs', () => {
        const positions: Vec3[] = [[9.5, 5, 5], [0.5, 5, 5]];
        const { ghostBonds } = splitBondsByMinimumImage({
            positions, bonds: [[0, 1, 2]], cell: CUBE, pbc: PBC,
        });
        expect(ghostBonds.map((g) => g[4])).toEqual([2, 2]);
    });

    it('leaves a continuous (unwrapped) trajectory untouched', () => {
        // An atom legitimately sitting outside the cell, still bonded normally:
        // this is what an unwrapped MD frame looks like and must NOT be split.
        const positions: Vec3[] = [[10.4, 5, 5], [11.9, 5, 5]];
        const out = splitBondsByMinimumImage({ positions, bonds: [[0, 1, 1]], cell: CUBE, pbc: PBC });
        expect(out.bonds).toEqual([[0, 1, 1]]);
        expect(out.ghostBonds).toEqual([]);
    });

    it('splits across a non-orthogonal cell too', () => {
        // gamma = 60 deg, the hexagonal-slab case.
        const hex = [[10, 0, 0], [5, 8.66, 0], [0, 0, 20]];
        const positions: Vec3[] = [[0.4, 0.4, 10], [9.7, 0.4, 10]];
        const out = splitBondsByMinimumImage({ positions, bonds: [[0, 1, 1]], cell: hex, pbc: PBC });
        expect(out.bonds).toEqual([]);
        expect(out.ghostBonds).toHaveLength(2);
    });

    it('respects a non-periodic axis: no wrapping along z for a slab', () => {
        const slab: [boolean, boolean, boolean] = [true, true, false];
        // Far apart along the NON-periodic z: there is no shorter image, so this
        // stays one (long) regular bond rather than being split.
        const positions: Vec3[] = [[5, 5, 0.5], [5, 5, 9.5]];
        const out = splitBondsByMinimumImage({ positions, bonds: [[0, 1, 1]], cell: CUBE, pbc: slab });
        expect(out.bonds).toEqual([[0, 1, 1]]);
        expect(out.ghostBonds).toEqual([]);
    });

    it('is a no-op without a usable cell (a molecule)', () => {
        const positions: Vec3[] = [[0, 0, 0], [9, 0, 0]];
        const bonds: [number, number, number][] = [[0, 1, 1]];
        expect(splitBondsByMinimumImage({ positions, bonds, cell: null, pbc: undefined }).bonds).toEqual(bonds);
        expect(splitBondsByMinimumImage({ positions, bonds, cell: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], pbc: PBC }).bonds)
            .toEqual(bonds);
    });

    it('is a no-op when the structure is not periodic at all', () => {
        const positions: Vec3[] = [[9.5, 5, 5], [0.5, 5, 5]];
        const bonds: [number, number, number][] = [[0, 1, 1]];
        const out = splitBondsByMinimumImage({ positions, bonds, cell: CUBE, pbc: [false, false, false] });
        expect(out.bonds).toEqual(bonds);
        expect(out.ghostBonds).toEqual([]);
    });

    it('skips bonds whose indices are out of range instead of emitting NaNs', () => {
        const positions: Vec3[] = [[5, 5, 5], [6, 5, 5]];
        const out = splitBondsByMinimumImage({
            positions, bonds: [[0, 7, 1], [-1, 0, 1], [0, 1, 1]], cell: CUBE, pbc: PBC,
        });
        expect(out.bonds).toEqual([[0, 1, 1]]);
        expect(out.ghostBonds).toEqual([]);
    });

    it('handles a pair straddling two faces at once (corner case)', () => {
        const positions: Vec3[] = [[9.6, 9.6, 5], [0.4, 0.4, 5]];
        const out = splitBondsByMinimumImage({ positions, bonds: [[0, 1, 1]], cell: CUBE, pbc: PBC });
        expect(out.bonds).toEqual([]);
        expect(out.ghostBonds).toHaveLength(2);
        for (const [start, end] of out.ghostBonds) {
            expect(len(start as Vec3, end as Vec3)).toBeLessThan(1.2);
        }
    });

    it('defaults a missing order to a single bond', () => {
        const positions: Vec3[] = [[9.5, 5, 5], [0.5, 5, 5]];
        const { ghostBonds } = splitBondsByMinimumImage({
            positions, bonds: [[0, 1]] as [number, number][], cell: CUBE, pbc: PBC,
        });
        expect(ghostBonds.map((g) => g[4])).toEqual([1, 1]);
    });
});
