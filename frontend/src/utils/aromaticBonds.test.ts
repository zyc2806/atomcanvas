/**
 * aromaticBonds.test.ts
 *
 * TDD tests for the aromaticBondIds helper and shouldHighlightBondHalf decision helper.
 * Written FIRST (RED), before the fix propagates to createUISlice and Bonds.tsx.
 * GL-free: no mounting, no react-three-fiber, no Canvas.
 */

import { describe, it, expect } from 'vitest';
import { aromaticBondIds, applyAromaticDisplay, shouldHighlightBondHalf, toBondId } from './aromaticBonds';

describe('toBondId', () => {
    it('produces canonical min-max ordering', () => {
        expect(toBondId(3, 1)).toBe('1-3');
        expect(toBondId(1, 3)).toBe('1-3');
    });
});

describe('aromaticBondIds', () => {
    it('returns empty set for empty bonds array', () => {
        expect(aromaticBondIds([])).toEqual(new Set());
    });

    it('returns only bonds with order 1.5', () => {
        const bonds: [number, number, number][] = [
            [0, 1, 1.0], // normal single
            [1, 2, 1.5], // aromatic
            [2, 3, 2.0], // double
            [3, 4, 1.5], // aromatic
        ];
        const ids = aromaticBondIds(bonds);
        expect(ids.has('1-2')).toBe(true);
        expect(ids.has('3-4')).toBe(true);
        expect(ids.has('0-1')).toBe(false);
        expect(ids.has('2-3')).toBe(false);
        expect(ids.size).toBe(2);
    });

    it('returns empty set when no bonds are aromatic', () => {
        const bonds: [number, number, number][] = [
            [0, 1, 1.0],
            [1, 2, 2.0],
        ];
        expect(aromaticBondIds(bonds).size).toBe(0);
    });

    it('handles non-canonical atom-index ordering (u > v)', () => {
        const bonds: [number, number, number][] = [[5, 2, 1.5]];
        const ids = aromaticBondIds(bonds);
        expect(ids.has('2-5')).toBe(true);
    });
});

describe('applyAromaticDisplay', () => {
    const benzeneBonds: [number, number, number][] = [
        [0, 1, 1.5], [1, 2, 1.5], [2, 3, 1.5],
        [3, 4, 1.5], [4, 5, 1.5], [5, 0, 1.5],
        [0, 6, 1.0], // a C-H bond (not aromatic)
    ];
    // Kekulé matching: doubles on 0-1, 2-3, 4-5; singles on the rest.
    const kekule = { '0-1': 2, '1-2': 1, '2-3': 2, '3-4': 1, '4-5': 2, '0-5': 1 };

    it('returns the bonds unchanged (same reference) when showAromaticRings is true', () => {
        const out = applyAromaticDisplay(benzeneBonds, kekule, true);
        expect(out).toBe(benzeneBonds);
    });

    it('returns the bonds unchanged when kekuleOrders is undefined', () => {
        const out = applyAromaticDisplay(benzeneBonds, undefined, false);
        expect(out).toBe(benzeneBonds);
    });

    it('swaps aromatic (1.5) bonds to their Kekulé order when off, leaving others intact', () => {
        const out = applyAromaticDisplay(benzeneBonds, kekule, false);
        const orderOf = (a: number, b: number) =>
            out.find(([u, v]) => u === a && v === b)![2];
        // alternating single/double around the ring
        expect(orderOf(0, 1)).toBe(2);
        expect(orderOf(1, 2)).toBe(1);
        expect(orderOf(2, 3)).toBe(2);
        expect(orderOf(3, 4)).toBe(1);
        expect(orderOf(4, 5)).toBe(2);
        expect(orderOf(5, 0)).toBe(1);
        // the C-H single bond is untouched
        expect(orderOf(0, 6)).toBe(1.0);
        // exactly three double bonds were produced
        expect(out.filter(([, , o]) => o === 2).length).toBe(3);
    });

    it('does not mutate the input array', () => {
        const snapshot = JSON.parse(JSON.stringify(benzeneBonds));
        applyAromaticDisplay(benzeneBonds, kekule, false);
        expect(benzeneBonds).toEqual(snapshot);
    });

    it('leaves an aromatic bond at 1.5 when it has no Kekulé entry (safe fallback)', () => {
        const bonds: [number, number, number][] = [[0, 1, 1.5], [1, 2, 1.5]];
        const partial = { '0-1': 2 }; // 1-2 missing
        const out = applyAromaticDisplay(bonds, partial, false);
        expect(out.find(([u, v]) => u === 0 && v === 1)![2]).toBe(2);
        expect(out.find(([u, v]) => u === 1 && v === 2)![2]).toBe(1.5);
    });

    it('looks up the Kekulé order by canonical min-max id (handles u > v)', () => {
        const bonds: [number, number, number][] = [[5, 2, 1.5]];
        const out = applyAromaticDisplay(bonds, { '2-5': 2 }, false);
        expect(out[0][2]).toBe(2);
    });

    it('returns the same reference when off but no aromatic bond is actually swapped', () => {
        const bonds: [number, number, number][] = [[0, 1, 1.0], [1, 2, 2.0]];
        const out = applyAromaticDisplay(bonds, { '0-1': 2 }, false);
        expect(out).toBe(bonds);
    });
});

describe('shouldHighlightBondHalf', () => {
    const aromaticIds = new Set(['1-2']); // bond between atoms 1 and 2 is aromatic
    const normalBondId = '0-1';           // bond between atoms 0 and 1 is normal
    const aromaticBondId = '1-2';

    describe('explicit bond selection (deliberate click) always highlights', () => {
        it('highlights aromatic bond when explicitly in selectedBonds', () => {
            const result = shouldHighlightBondHalf(
                1,              // atomIndex (part of aromatic bond)
                aromaticBondId,
                [1, 2],         // selectedAtoms
                [aromaticBondId], // selectedBonds — explicit click
                aromaticIds,
            );
            expect(result).toBe(true);
        });

        it('highlights normal bond when explicitly in selectedBonds', () => {
            const result = shouldHighlightBondHalf(
                0,
                normalBondId,
                [0, 1],
                [normalBondId],
                aromaticIds,
            );
            expect(result).toBe(true);
        });
    });

    describe('atom-selection-driven highlight', () => {
        it('highlights normal bond half when its atom is selected', () => {
            const result = shouldHighlightBondHalf(
                0,
                normalBondId,
                [0, 1],  // both atoms selected
                [],      // no explicit bond selection
                aromaticIds,
            );
            expect(result).toBe(true);
        });

        it('does NOT highlight aromatic bond half when its atom is selected (BUG 3 fix)', () => {
            const result = shouldHighlightBondHalf(
                1,               // atomIndex (part of aromatic bond)
                aromaticBondId,
                [1, 2],          // both ring carbons selected
                [],              // no explicit bond selection
                aromaticIds,
            );
            expect(result).toBe(false);
        });

        it('does NOT highlight when atom is not selected', () => {
            const result = shouldHighlightBondHalf(
                3,           // unselected atom
                '3-4',
                [0, 1],      // atoms 0 and 1 selected, not 3
                [],
                new Set(),
            );
            expect(result).toBe(false);
        });

        it('does NOT highlight aromatic bond even when only one atom is selected', () => {
            const result = shouldHighlightBondHalf(
                1,
                aromaticBondId,
                [1],   // only atom 1 selected
                [],
                aromaticIds,
            );
            expect(result).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('empty aromaticIds means all atom-selected bonds highlight', () => {
            const result = shouldHighlightBondHalf(
                0,
                '0-1',
                [0, 1],
                [],
                new Set(), // no aromatic bonds
            );
            expect(result).toBe(true);
        });
    });
});
