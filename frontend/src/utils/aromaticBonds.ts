/**
 * aromaticBonds.ts
 *
 * Pure, GL-free helpers for aromatic bond identification and highlight decisions.
 * No React, no Zustand, no Three.js imports — fully unit-testable without mounting.
 */

/** Bond tuple as stored in visualization.bonds: [atom1, atom2, order] */
type BondTuple = [number, number, number];

const AROMATIC_ORDER = 1.5;

/** Canonical bond-id string shared with createUISlice. */
export function toBondId(a: number, b: number): string {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return `${min}-${max}`;
}

/**
 * Returns the Set of logicalBondId strings whose order equals 1.5.
 * Pass `visualization.bonds` directly.
 */
export function aromaticBondIds(bonds: BondTuple[]): Set<string> {
    const ids = new Set<string>();
    for (const [u, v, order] of bonds) {
        if (order === AROMATIC_ORDER) {
            ids.add(toBondId(u, v));
        }
    }
    return ids;
}

/**
 * Pure highlight-decision for a single bond half.
 * Mirrors the logic inside Bonds.tsx's layout effect so it can be unit-tested
 * without mounting any GL/R3F component.
 *
 * Rules:
 *  - If the bond is explicitly in `selectedBonds` (deliberate click) → highlight.
 *  - Otherwise if the bond's atom is selected AND the bond is NOT aromatic → highlight.
 *  - Aromatic bonds are only highlighted when explicitly selected.
 */
export function shouldHighlightBondHalf(
    atomIndex: number,
    logicalBondId: string,
    selectedAtoms: number[],
    selectedBonds: string[],
    aromaticIds: Set<string>,
): boolean {
    const isBondSelected = selectedBonds.includes(logicalBondId);
    if (isBondSelected) return true;

    const isAtomSelected = selectedAtoms.includes(atomIndex);
    if (!isAtomSelected) return false;

    // Atom is selected — highlight only for non-aromatic bonds.
    return !aromaticIds.has(logicalBondId);
}
