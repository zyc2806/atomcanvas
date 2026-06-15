import React, { useLayoutEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Outlines } from '@react-three/drei';
import useStructureStore from '../../store/useStructureStore';
import {
    calculateBondTransform,
    clipGhostBondFromAtomToBoundary,
    clipBondToAtomSurfaces,
    getBondRadiusScale,
    getBondSurfaceTrim,
    getRenderedAtomRadius as getModeAdjustedAtomRadius,
} from '../../utils/bondUtils';
import useAtomColors from '../../hooks/useAtomColors';
import type { StandardStructureObject, Visualization } from '../../types/store';
import radiiData from '../../data/radii.json';
import { getAtomicNumber } from '../../utils/chemistry';
import { injectAlphaToStandardMaterial } from './materials/ToonHighlightMaterial';
import {
    getCartoonMaterialRenderState,
    getInstancedMaterialRenderState,
    isOpacityTransparent,
    resolveBondHalfOpacity,
    shouldShowCartoonOutline,
} from './materials/opacityPolicy';
import { syncMaterialAlphaHash } from './materials/materialUpdate';
import { isRenderableGhostBond, isRenderableRegularBond } from './bondRenderability';

interface BondsProps {
    structure?: StandardStructureObject;
    customBonds?: [number, number, number?][];
    customGhostBonds?: [[number, number, number], [number, number, number], number, number, number][];
    customPositions?: [number, number, number][];
    // Per-atom radius overrides (Size slider / per-element scale). Mirrors
    // Atoms.tsx so the bond trim follows the actual rendered atom radius.
    radiusOverrides?: { [i: number]: number };
}

interface BondHalf {
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

type WrappedGhostBond = Visualization['wrapped_ghost_bonds'][number];

const Bonds: React.FC<BondsProps> = ({ structure, customBonds, customGhostBonds, customPositions, radiusOverrides }) => {
    const { 
        structureData: storeStructureData, 
        visParams, 
        viewControls, 
        sceneSettings, 
        selectedBonds, 
        selectedAtoms,
        toggleBondSelection,
        bondOpacityOverrides 
    } = useStructureStore();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { bondRadius, atomScale, displayMode, renderStyle, cartoonParams } = visParams;
    const { showShadows, showBonds } = viewControls;
    const { getAtomColor, getAtomOpacity, getAtomBaseOpacity } = useAtomColors();

    const activeStructure = structure || storeStructureData;
    const isCustomMode = !!(customBonds && customPositions);

    const toonLightDir = useMemo(() => {
        const pos = sceneSettings.keyLight.position;
        return new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
    }, [sceneSettings.keyLight.position]);

    const bondHalves = useMemo((): BondHalf[] => {
        let positions: [number, number, number][] | undefined;
        let bonds: [number, number, number?][] | undefined;
        let ghostBonds: WrappedGhostBond[] = [];
        let symbols: string[] = [];

        if (isCustomMode) {
            positions = customPositions;
            bonds = customBonds;
            ghostBonds = customGhostBonds || [];
            symbols = activeStructure?.structure?.symbols || [];
        } else {
            if (!activeStructure || !activeStructure.visualization) return [];
            positions = activeStructure.structure.positions;
            bonds = activeStructure.visualization.bonds;
            ghostBonds = activeStructure.visualization.wrapped_ghost_bonds || [];
            symbols = activeStructure.structure.symbols;
        }

        if (!positions || !bonds) return [];

        const MIN_CLIPPED_BOND_LENGTH = 0.02;

        const getRenderedRadius = (atomIndex: number): number => {
            const symbol = symbols[atomIndex];
            const atomicNumber = getAtomicNumber(symbol);
            const elementRadius = radiiData[atomicNumber] || 0.5;
            return getModeAdjustedAtomRadius(elementRadius, atomScale, displayMode, radiusOverrides?.[atomIndex] ?? 1);
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
        
        const worldUp = new THREE.Vector3(0, 1, 0);
        const worldRight = new THREE.Vector3(1, 0, 0);

        // Pre-allocate vectors for performance
        const _vStart = new THREE.Vector3();
        const _vEnd = new THREE.Vector3();
        const _bondDir = new THREE.Vector3();
        const _planeNormal = new THREE.Vector3();
        const _nPos = new THREE.Vector3();
        const _v = new THREE.Vector3();
        const _n = new THREE.Vector3();
        const _right = new THREE.Vector3();

        const calculateBondRightVector = (
            bondDir: THREE.Vector3,
            idx1: number,
            idx2: number,
            pos1: THREE.Vector3,
            pos2: THREE.Vector3,
            order: number,
            adjacency: Record<number, number[]>,
            positions: [number, number, number][],
            // Pre-allocated vectors for performance
            _planeNormal: THREE.Vector3,
            _nPos: THREE.Vector3,
            _v: THREE.Vector3,
            _n: THREE.Vector3,
            _right: THREE.Vector3,
            worldUp: THREE.Vector3,
            worldRight: THREE.Vector3
        ): { right: THREE.Vector3; up: THREE.Vector3 } => {
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
        };

        for (let i = 0; i < bonds.length; i++) {
            const bond = bonds[i];
            const idx1 = bond[0];
            const idx2 = bond[1];
            const order = bond[2] !== undefined ? bond[2] : 1.0;

            if (!isRenderableRegularBond(idx1, idx2, positions!)) continue;
            
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
                adjacency, positions!,
                _planeNormal, _nPos, _v, _n, _right, worldUp, worldRight
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
                const angles = [0, 2*Math.PI/3, 4*Math.PI/3];
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
                // Build endpoints as plain arrays so the inner branch does not
                // allocate four Vector3s per offset (six per bond at order 3).
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
                    getBondSurfaceTrim(startAtomRadius, offsetLengthSq, displayMode),
                    getBondSurfaceTrim(endAtomRadius, offsetLengthSq, displayMode),
                    MIN_CLIPPED_BOND_LENGTH
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

            if (!isRenderableGhostBond(startPos, endPos, atomIdx, otherIdx, positions!.length)) {
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

            // Get original atom positions for neighbor analysis
            const pos1Arr = positions![atomIdx];
            const pos2Arr = positions![otherIdx];
            if (!pos1Arr || !pos2Arr) {
                continue;
            }
            const pos1 = new THREE.Vector3(pos1Arr[0], pos1Arr[1], pos1Arr[2]);
            const pos2 = new THREE.Vector3(pos2Arr[0], pos2Arr[1], pos2Arr[2]);

            const { right, up } = calculateBondRightVector(
                bondDir, atomIdx, otherIdx, pos1, pos2, order,
                adjacency, positions!,
                _planeNormal, _nPos, _v, _n, _right, worldUp, worldRight
            );

            const offsets: THREE.Vector3[] = [];
            
            if (order === 2.0) {
                const offsetDist = baseRadius * radiusScale * 1.2; 
                offsets.push(right.clone().multiplyScalar(offsetDist));
                offsets.push(right.clone().multiplyScalar(-offsetDist));
            } else if (order === 3.0) {
                const offsetDist = baseRadius * radiusScale * 1.4;
                const angles = [0, 2*Math.PI/3, 4*Math.PI/3];
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
                    getBondSurfaceTrim(startAtomRadius, offsetLengthSq, displayMode),
                    MIN_CLIPPED_BOND_LENGTH
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
    }, [activeStructure, customBonds, customGhostBonds, customPositions, isCustomMode, getAtomBaseOpacity, getAtomColor, getAtomOpacity, bondOpacityOverrides, atomScale, bondRadius, displayMode, renderStyle, radiusOverrides]);

    const alphaArray = useMemo(() => {
        const count = bondHalves.length;
        const array = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            array[i] = bondHalves[i].opacity;
        }
        return array;
    }, [bondHalves]);

    useLayoutEffect(() => {
        if (!meshRef.current || renderStyle === 'cartoon') return;
        const alphaAttribute = meshRef.current.geometry.getAttribute('instanceAlpha') as THREE.BufferAttribute | undefined;
        if (alphaAttribute && alphaAttribute.array.length === alphaArray.length) {
            alphaAttribute.copyArray(alphaArray);
            alphaAttribute.needsUpdate = true;
        }
    }, [alphaArray, renderStyle]);

    useLayoutEffect(() => {
        if (!meshRef.current || renderStyle === 'cartoon') return;
        if (bondHalves.length === 0) return;
        
        const dummy = new THREE.Object3D();
        const highlightColor = new THREE.Color(0xffff00);

        for (let i = 0; i < bondHalves.length; i++) {
            const half = bondHalves[i];
            dummy.position.copy(half.position);
            dummy.quaternion.copy(half.quaternion);
            dummy.scale.set(half.radiusScale, half.scaleY, half.radiusScale);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
            
            const isAtomSelected = selectedAtoms.includes(half.atomIndex);
            const isBondSelected = selectedBonds.includes(half.logicalBondId);

            if (isAtomSelected || isBondSelected) {
                meshRef.current.setColorAt(i, highlightColor);
            } else {
                meshRef.current.setColorAt(i, half.color);
            }
        }

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) {
            meshRef.current.instanceColor.needsUpdate = true;
        }
        if (meshRef.current.geometry.attributes.instanceAlpha) {
            (meshRef.current.geometry.attributes.instanceAlpha as THREE.BufferAttribute).needsUpdate = true;
        }
        
    }, [bondHalves, renderStyle, selectedBonds, selectedAtoms]);

    const hasTransparentBondHalves = bondHalves.some((half) => isOpacityTransparent(half.opacity));
    const instancedMaterialState = getInstancedMaterialRenderState(renderStyle, hasTransparentBondHalves);
    const shouldCastShadow = renderStyle === 'soft' && showShadows;
    const outlineThickness = renderStyle === 'cartoon' ? cartoonParams.outlineThickness : 1;
    const showStandardOutline = renderStyle === 'standard' && !hasTransparentBondHalves;

    useLayoutEffect(() => {
        if (!meshRef.current || renderStyle === 'cartoon') return;
        const material = meshRef.current.material as THREE.Material & { alphaHash: boolean };
        syncMaterialAlphaHash(material, instancedMaterialState.alphaHash);
    }, [instancedMaterialState.alphaHash, renderStyle]);

    if (!isCustomMode && (!activeStructure || !activeStructure.visualization || !activeStructure.visualization.bonds)) return null;
    if (displayMode === 'vdw' || !showBonds) return null;

    if (renderStyle === 'cartoon') {
        const highlightColor = new THREE.Color(0xffff00);
        return (
            <group>
                {bondHalves.map((half) => {
                    const materialState = getCartoonMaterialRenderState(half.opacity);
                    const isSelected = selectedBonds.includes(half.logicalBondId) || selectedAtoms.includes(half.atomIndex);
                    return (
                        <mesh
                            key={`bond-${half.id}`}
                            position={half.position}
                            quaternion={half.quaternion}
                            scale={[half.radiusScale, half.scaleY, half.radiusScale]}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleBondSelection(half.logicalBondId);
                            }}
                        >
                            <cylinderGeometry args={[bondRadius, bondRadius, 1, 16]} />
                            <toonHighlightMaterial
                                uColor={isSelected ? highlightColor : half.color}
                                uLightDir={toonLightDir}
                                uLightIntensity={sceneSettings.globalBrightness}
                                uShadowThreshold={cartoonParams.shadowThreshold}
                                uHighlightThreshold={cartoonParams.highlightThreshold}
                                uShadowBrightness={cartoonParams.shadowBrightness}
                                uOpacity={half.opacity}
                                transparent={materialState.transparent}
                                depthWrite={materialState.depthWrite}
                                alphaHash={materialState.alphaHash}
                                onUpdate={(material) => {
                                    syncMaterialAlphaHash(material as THREE.Material & { alphaHash: boolean }, materialState.alphaHash);
                                }}
                            />
                            {shouldShowCartoonOutline(half.opacity) && (
                                <Outlines thickness={outlineThickness} color="black" />
                            )}
                        </mesh>
                    );
                })}
            </group>
        );
    }

    return (
        <instancedMesh
            // key only on count; render-mode toggles update material/matrices
            // in place and don't need a fresh InstancedMesh.
            key={bondHalves.length}
            ref={meshRef}
            args={[undefined, undefined, bondHalves.length]}
            castShadow={shouldCastShadow}
            receiveShadow={shouldCastShadow}
            onClick={(e) => {
                e.stopPropagation();
                if (e.instanceId !== undefined) {
                    const half = bondHalves[e.instanceId];
                    if (half) toggleBondSelection(half.logicalBondId);
                }
            }}
        >
            <cylinderGeometry args={[bondRadius, bondRadius, 1, 8]}>
                <instancedBufferAttribute attach="attributes-instanceAlpha" args={[alphaArray, 1]} />
            </cylinderGeometry>
            <meshStandardMaterial 
                roughness={renderStyle === 'standard' ? 0.3 : 1}
                transparent={instancedMaterialState.transparent}
                alphaHash={instancedMaterialState.alphaHash}
                onBeforeCompile={injectAlphaToStandardMaterial}
            />
            {showStandardOutline && <Outlines thickness={1} color="black" />}
        </instancedMesh>
    );
};

export default Bonds;
