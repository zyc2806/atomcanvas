/**
 * atomDisplayData.ts
 *
 * Pure helper extracted from Atoms.tsx's `atomsData` useMemo.
 * Converts per-atom position/symbol data into per-instance display descriptors.
 * No React, no Zustand, no GL context required.
 */

import * as THREE from 'three';
import radiiData from '../../data/radii.json';
import { getAtomicNumber } from '../../utils/chemistry';
import type { DisplayMode, RenderStyle } from '../../types/store';

export interface AtomDisplayDatum {
    position: THREE.Vector3;
    scale: number;
    color: THREE.Color;
    opacity: number;
}

// This constant matches Atoms.tsx's inline literal
export const WIREFRAME_HIT_SCALE = 0.3;

export interface ComputeAtomDisplayDataParams {
    positions: [number, number, number][];
    symbols: string[];
    atomScale: number;
    displayMode: DisplayMode;
    renderStyle: RenderStyle;
    radiusOverrides?: Record<number, number>;
    /** Resolve the rendered color for a given atom index + symbol. */
    getAtomColor: (idx: number, symbol: string) => THREE.Color;
    /** Resolve the per-atom opacity for non-cartoon render styles. */
    getAtomOpacity: (idx: number) => number;
    /** Resolve the global base opacity for the cartoon render style. */
    getAtomBaseOpacity: () => number;
}

/**
 * Computes per-atom display data (position, scale, color, opacity).
 * Exact port of the `atomsData` useMemo from Atoms.tsx; behavior is identical.
 */
export function computeAtomDisplayData(params: ComputeAtomDisplayDataParams): AtomDisplayDatum[] {
    const {
        positions,
        symbols,
        atomScale,
        displayMode,
        renderStyle,
        radiusOverrides,
        getAtomColor,
        getAtomOpacity,
        getAtomBaseOpacity,
    } = params;

    return positions.map((pos, i) => {
        const atomicNumber = getAtomicNumber(symbols[i]);
        const radius = ((radiiData as Record<number, number>)[atomicNumber] ?? 0.5) * (radiusOverrides?.[i] ?? 1);
        const baseScale = radius * atomScale * 2;
        const scale = displayMode === 'wireframe' ? baseScale * WIREFRAME_HIT_SCALE : baseScale;

        return {
            position: new THREE.Vector3(pos[0], pos[1], pos[2]),
            scale,
            color: getAtomColor(i, symbols[i]),
            // Cartoon uses a single global base opacity (it ignores partial
            // per-atom transparency by design), BUT a fully-hidden atom
            // (opacity override 0) must still flow through as 0 so the toon
            // material's alpha-hash discards it. Otherwise hiding an atom in
            // cartoon mode leaves it fully visible.
            opacity: renderStyle === 'cartoon'
                ? (getAtomOpacity(i) === 0 ? 0 : getAtomBaseOpacity())
                : getAtomOpacity(i),
        };
    });
}
