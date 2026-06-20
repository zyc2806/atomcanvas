import React, { useLayoutEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Outlines } from '@react-three/drei';
import useStructureStore from '../../store/useStructureStore';
import useAtomColors from '../../hooks/useAtomColors';
import type { StandardStructureObject } from '../../types/store';
import { injectAlphaToStandardMaterial } from './materials/ToonHighlightMaterial';
import {
    getInstancedMaterialRenderState,
    getCartoonMaterialRenderState,
    shouldShowCartoonOutline,
    isOpacityTransparent,
} from './materials/opacityPolicy';
import { pickAtomMaterialKind } from './materials/materialKind';
import { syncMaterialAlphaHash } from './materials/materialUpdate';
import { computeBondHalves } from './bondHalves';
import type { BondHalf, WrappedGhostBond } from './bondHalves';
import type { LodSettings } from './lod';
import { aromaticBondIds, shouldHighlightBondHalf } from '../../utils/aromaticBonds';

// Stable fallback uColor for the instanced toon material. The instanced path
// always sets per-half colors via setColorAt, so USE_INSTANCING_COLOR is defined
// and the shader reads instanceColor (vTint) — uColor is the non-instanced fallback
// and is never actually sampled here, but must be a valid THREE.Color.
const DEFAULT_TOON_COLOR = new THREE.Color(0.5, 0.5, 0.5);

interface BondsProps {
    structure?: StandardStructureObject;
    customBonds?: [number, number, number?][];
    customGhostBonds?: [[number, number, number], [number, number, number], number, number, number][];
    customPositions?: [number, number, number][];
    // Per-atom radius overrides (Size slider / per-element scale). Mirrors
    // Atoms.tsx so the bond trim follows the actual rendered atom radius.
    radiusOverrides?: { [i: number]: number };
    lod: LodSettings;
}

const Bonds: React.FC<BondsProps> = ({ structure, customBonds, customGhostBonds, customPositions, radiusOverrides, lod }) => {
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

        return computeBondHalves({
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
        });
    }, [activeStructure, customBonds, customGhostBonds, customPositions, isCustomMode, getAtomBaseOpacity, getAtomColor, getAtomOpacity, bondOpacityOverrides, atomScale, bondRadius, displayMode, renderStyle, radiusOverrides]);

    // Precompute the Set of aromatic logicalBondIds so the highlight effect can
    // gate atom-selection-driven highlights without touching aromatic bonds.
    const aromaticIds = useMemo((): Set<string> => {
        const bonds = isCustomMode
            ? (customBonds as [number, number, number][] | undefined)
            : activeStructure?.visualization?.bonds;
        if (!bonds) return new Set();
        return aromaticBondIds(bonds as [number, number, number][]);
    }, [activeStructure, customBonds, isCustomMode]);

    const alphaArray = useMemo(() => {
        const count = bondHalves.length;
        const array = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            array[i] = bondHalves[i].opacity;
        }
        return array;
    }, [bondHalves]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const alphaAttribute = meshRef.current.geometry.getAttribute('instanceAlpha') as THREE.BufferAttribute | undefined;
        if (alphaAttribute && alphaAttribute.array.length === alphaArray.length) {
            alphaAttribute.copyArray(alphaArray);
            alphaAttribute.needsUpdate = true;
        }
    }, [alphaArray]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
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
            
            const highlight = shouldHighlightBondHalf(
                half.atomIndex,
                half.logicalBondId,
                selectedAtoms,
                selectedBonds,
                aromaticIds,
            );

            if (highlight) {
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

    }, [bondHalves, renderStyle, selectedBonds, selectedAtoms, aromaticIds]);

    const isCartoon = renderStyle === 'cartoon';
    const bondMaterialKind = pickAtomMaterialKind(renderStyle);
    const hasTransparentBondHalves = bondHalves.some((half) => isOpacityTransparent(half.opacity));
    const instancedMaterialState = getInstancedMaterialRenderState(renderStyle, hasTransparentBondHalves);
    // Cartoon keeps its historical render state (opaque, no alpha-hash): the toon
    // shader wrote per-half opacity to gl_FragColor.a but ran with transparent=false,
    // so bond opacity never blended. Preserve that exactly on the instanced path.
    const cartoonMatState = getCartoonMaterialRenderState(getAtomBaseOpacity());
    const materialTransparent = isCartoon ? cartoonMatState.transparent : instancedMaterialState.transparent;
    const materialAlphaHash = isCartoon ? cartoonMatState.alphaHash : instancedMaterialState.alphaHash;
    const shouldCastShadow = renderStyle === 'soft' && showShadows;
    const outlineThickness = isCartoon ? cartoonParams.outlineThickness : 1;
    // Cartoon always drew the inverted-hull outline (shouldShowCartoonOutline policy);
    // standard only when fully opaque.
    const showInstancedOutline = (isCartoon && shouldShowCartoonOutline(getAtomBaseOpacity()))
        || (renderStyle === 'standard' && !hasTransparentBondHalves);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const material = meshRef.current.material as THREE.Material & { alphaHash: boolean };
        syncMaterialAlphaHash(material, materialAlphaHash);
    }, [materialAlphaHash]);

    if (!isCustomMode && (!activeStructure || !activeStructure.visualization || !activeStructure.visualization.bonds)) return null;
    if (displayMode === 'vdw' || !showBonds) return null;

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
            <cylinderGeometry args={[bondRadius, bondRadius, 1, lod.cylinderRadialSegments]}>
                <instancedBufferAttribute attach="attributes-instanceAlpha" args={[alphaArray, 1]} />
            </cylinderGeometry>
            {bondMaterialKind === 'toon' ? (
                // Per-half color (incl. the yellow selection highlight, applied via
                // setColorAt in the matrix effect above) flows instanceColor -> the
                // toon shader's vertex-side `vTint` varying. Per-half opacity flows
                // through instanceAlpha; uOpacity stays 1 so the shader uses vAlpha.
                <toonHighlightMaterial
                    transparent={materialTransparent}
                    alphaHash={materialAlphaHash}
                    uColor={DEFAULT_TOON_COLOR}
                    uLightDir={toonLightDir}
                    uLightIntensity={sceneSettings.globalBrightness}
                    uShadowThreshold={cartoonParams.shadowThreshold}
                    uHighlightThreshold={cartoonParams.highlightThreshold}
                    uShadowBrightness={cartoonParams.shadowBrightness}
                    uOpacity={1}
                />
            ) : (
                <meshStandardMaterial
                    roughness={renderStyle === 'standard' ? 0.3 : 1}
                    transparent={materialTransparent}
                    alphaHash={materialAlphaHash}
                    onBeforeCompile={injectAlphaToStandardMaterial}
                />
            )}
            {showInstancedOutline && lod.showOutlines && <Outlines thickness={outlineThickness} color="black" />}
        </instancedMesh>
    );
};

export default Bonds;
