/**
 * bondHalves.ts
 *
 * Pure helper extracted from Bonds.tsx's `bondHalves` useMemo.
 * Converts raw bond/position data into per-half instanced-mesh descriptors.
 * No React, no Zustand, no GL context required.
 */

import * as THREE from 'three';
import {
    calculateBondTransform,
    clipGhostBondFromAtomToBoundary,
    clipBondToAtomSurfaces,
    getBondRadiusScale,
    getOpacityAwareBondTrim,
    getRenderedAtomRadius as getModeAdjustedAtomRadius,
} from '../../utils/bondUtils';
import radiiData from '../../data/radii.json';
import { getAtomicNumber } from '../../utils/chemistry';
import {
    isOpacityTransparent,
    resolveBondHalfOpacity,
} from './materials/opacityPolicy';
import { isRenderableGhostBond, isRenderableRegularBond } from './bondRenderability';
import type { DisplayMode, RenderStyle, Visualization } from '../../types/store';

export interface BondHalf {
    id: string;
    bondId: string;
    logicalBondId: string;
    atomIndex: number;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scaleY: number;
    radiusScale: number;
    color: THREE.Color;
    opacity: number;
}

export type WrappedGhostBond = Visualization['wrapped_ghost_bonds'][number];

export interface ComputeBondHalvesParams {
    positions: [number, number, number][];
    bonds: [number, number, number?][];
    ghostBonds: WrappedGhostBond[];
    symbols: string[];
    atomScale: number;
    bondRadius: number;
    displayMode: DisplayMode;
    renderStyle: RenderStyle;
    radiusOverrides?: Record<number, number>;
    bondOpacityOverrides?: Record<string, number> | null;
    /** Resolve the rendered color for a given atom index + symbol. */
    getAtomColor: (idx: number, symbol: string) => THREE.Color;
    /** Resolve the per-atom opacity for non-cartoon render styles. */
    getAtomOpacity: (idx: number) => number;
    /** Resolve the global base opacity for the cartoon render style. */
    getAtomBaseOpacity: () => number;
}

const MIN_CLIPPED_BOND_LENGTH = 0.02;

const worldUp = new THREE.Vector3(0, 1, 0);
const worldRight = new THREE.Vector3(1, 0, 0);

function calculateBondRightVector(
    bondDir: THREE.Vector3,
    idx1: number,
    idx2: number,
    pos1: THREE.Vector3,
    pos2: THREE.Vector3,
    order: number,
    adjacency: Record<number, number[]>,
    positions: [number, number, number][],
    _planeNormal: THREE.Vector3,
    _nPos: THREE.Vector3,
    _v: THREE.Vector3,
    _n: THREE.Vector3,
    _right: THREE.Vector3,
): { right: THREE.Vector3; up: THREE.Vector3 } {
    _planeNormal.set(0, 0, 0);
    let neighborCount = 0;

    if (order > 1.0) {
        const addNeighborNormals = (centerIdx: number, otherIdx: number, centerPos: THREE.Vector3) => {
            const neighbors = adjacency[centerIdx];
            if (neighbors) {
                for (const nIdx of neighbors) {
                    if (nIdx === otherIdx) continue;
                    const nPosArr = positions[nIdx];
                    if (!nPosArr) continue;
                    _nPos.set(nPosArr[0], nPosArr[1], nPosArr[2]);
                    _v.subVectors(_nPos, centerPos).normalize();
                    _n.crossVectors(_v, bondDir);

                    // Prevent symmetric cancellation
                    if (_planeNormal.dot(_n) < 0) _n.negate();

                    _planeNormal.add(_n);
                    neighborCount++;
                }
            }
        };

        addNeighborNormals(idx1, idx2, pos1);
        addNeighborNormals(idx2, idx1, pos2);
    }

    if (neighborCount > 0 && _planeNormal.lengthSq() > 0.001) {
        _planeNormal.normalize();
        _right.crossVectors(_planeNormal, bondDir).normalize();
    } else {
        _right.crossVectors(bondDir, worldUp).normalize();
        if (_right.lengthSq() < 0.001) {
            _right.crossVectors(bondDir, worldRight).normalize();
        }
    }

    const up = new THREE.Vector3().crossVectors(_right, bondDir).normalize();
    return { right: _right, up };
}

/**
 * Computes the array of BondHalf descriptors from raw structure + vis-param inputs.
 * Exact port of the `bondHalves` useMemo from Bonds.tsx; behavior is byte-identical.
 */
export function computeBondHalves(params: ComputeBondHalvesParams): BondHalf[] {
    const {
        positions,
        bonds,
        ghostBonds,
        symbols,
        atomScale,
        bondRadius,
        displayMode,
        renderStyle,
        radiusOverrides,
        bondOpacityOverrides,
        getAtomColor,
        getAtomOpacity,
        getAtomBaseOpacity,
    } = params;

    const getRenderedRadius = (atomIndex: number): number => {
        const symbol = symbols[atomIndex];
        const atomicNumber = getAtomicNumber(symbol);
        const elementRadius = (radiiData as Record<number, number>)[atomicNumber] ?? 0.5;
        return getModeAdjustedAtomRadius(elementRadius, atomScale, displayMode, radiusOverrides?.[atomIndex] ?? 1);
    };

    const isAtomTransparent = (atomIndex: number): boolean => {
        const op = renderStyle === 'cartoon' ? getAtomBaseOpacity() : getAtomOpacity(atomIndex);
        return isOpacityTransparent(op);
    };

    const adjacency: Record<number, number[]> = {};
    for (let i = 0; i < bonds.length; i++) {
        const b = bonds[i];
        const idx1 = b[0];
        const idx2 = b[1];
        if (!adjacency[idx1]) adjacency[idx1] = [];
        if (!adjacency[idx2]) adjacency[idx2] = [];
        adjacency[idx1].push(idx2);
        adjacency[idx2].push(idx1);
    }

    const halves: BondHalf[] = [];

    // Pre-allocate vectors for performance
    const _vStart = new THREE.Vector3();
    const _vEnd = new THREE.Vector3();
    const _bondDir = new THREE.Vector3();
    const _planeNormal = new THREE.Vector3();
    const _nPos = new THREE.Vector3();
    const _v = new THREE.Vector3();
    const _n = new THREE.Vector3();
    const _right = new THREE.Vector3();

    for (let i = 0; i < bonds.length; i++) {
        const bond = bonds[i];
        const idx1 = bond[0];
        const idx2 = bond[1];
        const order = bond[2] !== undefined ? bond[2] : 1.0;

        if (!isRenderableRegularBond(idx1, idx2, positions)) continue;

        const start = positions[idx1];
        const end = positions[idx2];

        if (!start || !end) continue;

        _vStart.set(start[0], start[1], start[2]);
        _vEnd.set(end[0], end[1], end[2]);
        _bondDir.subVectors(_vEnd, _vStart);
        if (_bondDir.lengthSq() <= 1e-12) continue;
        _bondDir.normalize();

        const { right, up } = calculateBondRightVector(
            _bondDir, idx1, idx2, _vStart, _vEnd, order,
            adjacency, positions,
            _planeNormal, _nPos, _v, _n, _right,
        );

        const radiusScale = getBondRadiusScale(symbols[idx1], symbols[idx2]);
        const startAtomRadius = getRenderedRadius(idx1);
        const endAtomRadius = getRenderedRadius(idx2);
        const baseRadius = bondRadius;

        const offsets: THREE.Vector3[] = [];

        if (order === 2.0) {
            const offsetDist = baseRadius * radiusScale * 1.2;
            offsets.push(right.clone().multiplyScalar(offsetDist));
            offsets.push(right.clone().multiplyScalar(-offsetDist));
        } else if (order === 3.0) {
            const offsetDist = baseRadius * radiusScale * 1.4;
            const angles = [0, 2 * Math.PI / 3, 4 * Math.PI / 3];
            for (const ang of angles) {
                const vec = right.clone().multiplyScalar(Math.cos(ang))
                    .add(up.clone().multiplyScalar(Math.sin(ang)))
                    .multiplyScalar(offsetDist);
                offsets.push(vec);
            }
        } else {
            offsets.push(new THREE.Vector3(0, 0, 0));
        }

        for (let k = 0; k < offsets.length; k++) {
            const off = offsets[k];
            const sx = _vStart.x + off.x;
            const sy = _vStart.y + off.y;
            const sz = _vStart.z + off.z;
            const ex = _vEnd.x + off.x;
            const ey = _vEnd.y + off.y;
            const ez = _vEnd.z + off.z;
            const offsetLengthSq = off.lengthSq();
            const clipped = clipBondToAtomSurfaces(
                [sx, sy, sz],
                [ex, ey, ez],
                getOpacityAwareBondTrim(startAtomRadius, offsetLengthSq, displayMode, isAtomTransparent(idx1)),
                getOpacityAwareBondTrim(endAtomRadius, offsetLengthSq, displayMode, isAtomTransparent(idx2)),
                MIN_CLIPPED_BOND_LENGTH,
            );
            if (!clipped) continue;

            const sArr: [number, number, number] = clipped.start as [number, number, number];
            const eArr: [number, number, number] = clipped.end as [number, number, number];
            const mArr: [number, number, number] = [
                (sArr[0] + eArr[0]) * 0.5,
                (sArr[1] + eArr[1]) * 0.5,
                (sArr[2] + eArr[2]) * 0.5,
            ];

            const bondId = `${Math.min(idx1, idx2)}-${Math.max(idx1, idx2)}`;

            const transform1 = calculateBondTransform(sArr, mArr);
            halves.push({
                id: `${i}-${k}-a`,
                bondId,
                logicalBondId: bondId,
                atomIndex: idx1,
                position: transform1.position,
                quaternion: transform1.quaternion,
                scaleY: transform1.scale,
                radiusScale: radiusScale * (order >= 2.0 ? 0.6 : 1.0),
                color: getAtomColor(idx1, symbols[idx1]),
                opacity: renderStyle === 'cartoon'
                    ? getAtomBaseOpacity()
                    : resolveBondHalfOpacity(getAtomOpacity(idx1), bondOpacityOverrides?.[bondId]),
            });

            const transform2 = calculateBondTransform(mArr, eArr);
            halves.push({
                id: `${i}-${k}-b`,
                bondId,
                logicalBondId: bondId,
                atomIndex: idx2,
                position: transform2.position,
                quaternion: transform2.quaternion,
                scaleY: transform2.scale,
                radiusScale: radiusScale * (order >= 2.0 ? 0.6 : 1.0),
                color: getAtomColor(idx2, symbols[idx2]),
                opacity: renderStyle === 'cartoon'
                    ? getAtomBaseOpacity()
                    : resolveBondHalfOpacity(getAtomOpacity(idx2), bondOpacityOverrides?.[bondId]),
            });
        }
    }

    for (let i = 0; i < ghostBonds.length; i++) {
        const [startPos, endPos, atomIdx, otherIdx, order = 1.0] = ghostBonds[i];

        if (!isRenderableGhostBond(startPos, endPos, atomIdx, otherIdx, positions.length)) {
            continue;
        }

        const vStart = new THREE.Vector3(startPos[0], startPos[1], startPos[2]);
        const vEnd = new THREE.Vector3(endPos[0], endPos[1], endPos[2]);

        const symbol = symbols[atomIdx];
        const color = getAtomColor(atomIdx, symbol);
        const bondId = `${Math.min(atomIdx, otherIdx)}-${Math.max(atomIdx, otherIdx)}`;
        const opacity = renderStyle === 'cartoon'
            ? getAtomBaseOpacity()
            : resolveBondHalfOpacity(getAtomOpacity(atomIdx), bondOpacityOverrides?.[bondId]);
        const radiusScale = getBondRadiusScale(symbol, symbol);
        const startAtomRadius = getRenderedRadius(atomIdx);
        const baseRadius = bondRadius;

        const bondDir = new THREE.Vector3().subVectors(vEnd, vStart);
        if (bondDir.lengthSq() <= 1e-12) {
            continue;
        }
        bondDir.normalize();

        const pos1Arr = positions[atomIdx];
        const pos2Arr = positions[otherIdx];
        if (!pos1Arr || !pos2Arr) {
            continue;
        }
        const pos1 = new THREE.Vector3(pos1Arr[0], pos1Arr[1], pos1Arr[2]);
        const pos2 = new THREE.Vector3(pos2Arr[0], pos2Arr[1], pos2Arr[2]);

        const { right, up } = calculateBondRightVector(
            bondDir, atomIdx, otherIdx, pos1, pos2, order,
            adjacency, positions,
            _planeNormal, _nPos, _v, _n, _right,
        );

        const offsets: THREE.Vector3[] = [];

        if (order === 2.0) {
            const offsetDist = baseRadius * radiusScale * 1.2;
            offsets.push(right.clone().multiplyScalar(offsetDist));
            offsets.push(right.clone().multiplyScalar(-offsetDist));
        } else if (order === 3.0) {
            const offsetDist = baseRadius * radiusScale * 1.4;
            const angles = [0, 2 * Math.PI / 3, 4 * Math.PI / 3];
            for (const ang of angles) {
                const vec = right.clone().multiplyScalar(Math.cos(ang))
                    .add(up.clone().multiplyScalar(Math.sin(ang)))
                    .multiplyScalar(offsetDist);
                offsets.push(vec);
            }
        } else {
            offsets.push(new THREE.Vector3(0, 0, 0));
        }

        for (let k = 0; k < offsets.length; k++) {
            const off = offsets[k];
            const s = new THREE.Vector3().addVectors(vStart, off);
            const e = new THREE.Vector3().addVectors(vEnd, off);
            const offsetLengthSq = off.lengthSq();
            const clipped = clipGhostBondFromAtomToBoundary(
                [s.x, s.y, s.z],
                [e.x, e.y, e.z],
                getOpacityAwareBondTrim(startAtomRadius, offsetLengthSq, displayMode, isAtomTransparent(atomIdx)),
                MIN_CLIPPED_BOND_LENGTH,
            );
            if (!clipped) continue;

            const clippedStart = new THREE.Vector3(...clipped.start);
            const clippedEnd = new THREE.Vector3(...clipped.end);
            const clippedMid = new THREE.Vector3().addVectors(clippedStart, clippedEnd).multiplyScalar(0.5);

            const sArr: [number, number, number] = [clippedStart.x, clippedStart.y, clippedStart.z];
            const eArr: [number, number, number] = [clippedEnd.x, clippedEnd.y, clippedEnd.z];
            const mArr: [number, number, number] = [clippedMid.x, clippedMid.y, clippedMid.z];

            const transform1 = calculateBondTransform(sArr, mArr);
            halves.push({
                id: `ghost-${i}-${k}-a`,
                bondId,
                logicalBondId: bondId,
                atomIndex: atomIdx,
                position: transform1.position,
                quaternion: transform1.quaternion,
                scaleY: transform1.scale,
                radiusScale: radiusScale * (order >= 2.0 ? 0.6 : 1.0),
                color,
                opacity,
            });

            const transform2 = calculateBondTransform(mArr, eArr);
            halves.push({
                id: `ghost-${i}-${k}-b`,
                bondId,
                logicalBondId: bondId,
                atomIndex: atomIdx,
                position: transform2.position,
                quaternion: transform2.quaternion,
                scaleY: transform2.scale,
                radiusScale: radiusScale * (order >= 2.0 ? 0.6 : 1.0),
                color,
                opacity,
            });
        }
    }

    return halves;
}
