import React, { useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { Outlines, Html } from '@react-three/drei';
import useStructureStore from '../../store/useStructureStore';
import useAtomColors from '../../hooks/useAtomColors';
import radiiData from '../../data/radii.json';
import { getAtomicNumber } from '../../utils/chemistry';
import { injectAlphaToStandardMaterial } from './materials/ToonHighlightMaterial';
import {
    getInstancedMaterialRenderState,
    getCartoonMaterialRenderState,
    shouldShowCartoonOutline,
    isOpacityTransparent,
} from './materials/opacityPolicy';
import { pickAtomMaterialKind } from './materials/materialKind';
import { syncMaterialAlphaHash } from './materials/materialUpdate';
import { computeAtomDisplayData, WIREFRAME_HIT_SCALE } from './atomDisplayData';
import { displayPositions } from './displayPositions';
import AtomLabels from './AtomLabels';
import type { LodSettings } from './lod';

interface AtomsProps {
    customPositions?: [number, number, number][];
    radiusOverrides?: { [i: number]: number };
    colorOverrides?: { [i: number]: string };
    opacityOverrides?: { [i: number]: number };
    lod: LodSettings;
}

// Stable fallback uColor for the instanced toon material. The instanced path
// always sets per-instance colors via setColorAt, so USE_INSTANCING_COLOR is
// defined and the shader reads instanceColor (vTint) — uColor is the non-instanced
// fallback and is never actually sampled here, but must be a valid THREE.Color.
const DEFAULT_TOON_COLOR = new THREE.Color(0.5, 0.5, 0.5);

const Atoms: React.FC<AtomsProps> = ({ customPositions, radiusOverrides, colorOverrides, opacityOverrides, lod }) => {
    const { structureData, toggleSelection, viewControls, visParams, selectionMode, clusterIndices, setSlabTarget, sceneSettings } = useStructureStore();
    const { getAtomColor: getAtomBaseColorForIndex, getAtomOpacity: getAtomBaseOpacityForIndex, getAtomBaseOpacity } = useAtomColors();

    // Per-atom overrides (element-style + store) win over the hook-resolved color.
    const getAtomColor = useCallback((index: number, symbol: string) => {
        const override = colorOverrides?.[index];
        if (override !== undefined) return new THREE.Color(override);
        return getAtomBaseColorForIndex(index, symbol);
    }, [colorOverrides, getAtomBaseColorForIndex]);

    const getAtomOpacity = useCallback((index: number) => {
        const override = opacityOverrides?.[index];
        if (override !== undefined) return override;
        return getAtomBaseOpacityForIndex(index);
    }, [opacityOverrides, getAtomBaseOpacityForIndex]);
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { showShadows, showOutline, showLabels } = viewControls;
    const { displayMode, renderStyle, cartoonParams, atomScale } = visParams;
    const [hovered, setHovered] = useState<number | null>(null);

    const toonLightDir = useMemo(() => {
        const pos = sceneSettings.keyLight.position;
        return new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
    }, [sceneSettings.keyLight.position]);

    const elementIndices = useMemo(() => {
        if (!structureData) return [];
        const indices: number[] = [];
        const counts: { [key: string]: number } = {};
        structureData.structure.symbols.forEach(sym => {
            counts[sym] = (counts[sym] || 0) + 1;
            indices.push(counts[sym]);
        });
        return indices;
    }, [structureData]);

    const atomsData = useMemo(() => {
        if (!structureData) return [];
        const positions = customPositions || displayPositions(structureData.structure);
        const symbols = structureData.structure.symbols;
        return computeAtomDisplayData({
            positions,
            symbols,
            atomScale,
            displayMode,
            renderStyle,
            radiusOverrides,
            getAtomColor,
            getAtomOpacity,
            getAtomBaseOpacity,
        });
    }, [structureData, customPositions, atomScale, displayMode, getAtomBaseOpacity, getAtomColor, getAtomOpacity, renderStyle, radiusOverrides]);

    const alphaArray = useMemo(() => {
        // Drive instanceAlpha from the SAME (cartoon-clamped) opacity used for
        // hasTransparentAtoms, not the raw getAtomOpacity. In cartoon this yields
        // 0 for a hidden atom (discarded) and 1.0 for a partial atom (opaque) —
        // so hiding one atom can't accidentally alpha-hash-dither a partially
        // transparent atom. For standard/soft atomsData.opacity === getAtomOpacity.
        const count = atomsData.length;
        const array = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            array[i] = atomsData[i].opacity;
        }
        return array;
    }, [atomsData]);

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const alphaAttribute = meshRef.current.geometry.getAttribute('instanceAlpha') as THREE.BufferAttribute | undefined;
        if (alphaAttribute && alphaAttribute.array.length === alphaArray.length) {
            alphaAttribute.copyArray(alphaArray);
            alphaAttribute.needsUpdate = true;
        }
    }, [alphaArray]);

    useLayoutEffect(() => {
        if (!structureData || !meshRef.current) return;
        
        const positions = customPositions || displayPositions(structureData.structure);
        const symbols = structureData.structure.symbols;
        const count = positions.length;
        const dummy = new THREE.Object3D();

        for (let i = 0; i < count; i++) {
            const [x, y, z] = positions[i];
            const atomicNumber = getAtomicNumber(symbols[i]);
            const radius = ((radiiData as Record<number, number>)[atomicNumber] ?? 0.5) * (radiusOverrides?.[i] ?? 1);
            const baseScale = radius * atomScale * 2;
            const scale = displayMode === 'wireframe' ? baseScale * WIREFRAME_HIT_SCALE : baseScale;

            dummy.position.set(x, y, z);
            dummy.scale.set(scale, scale, scale);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);

            const color = getAtomColor(i, symbols[i]);
            meshRef.current.setColorAt(i, color);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        if (meshRef.current.geometry.attributes.instanceAlpha) (meshRef.current.geometry.attributes.instanceAlpha as THREE.BufferAttribute).needsUpdate = true;

    }, [structureData, getAtomColor, customPositions, atomScale, displayMode, renderStyle, radiusOverrides]);

    const isWireframe = displayMode === 'wireframe';
    const isCartoon = renderStyle === 'cartoon';
    const hasTransparentAtoms = atomsData.some((atom) => isOpacityTransparent(atom.opacity));
    const instancedMaterialState = getInstancedMaterialRenderState(renderStyle, hasTransparentAtoms);
    // Cartoon stays opaque (no partial-transparency blending), but enables
    // alpha-hash when an atom is hidden so the toon shader discards the alpha-0
    // instance — without it, hidden atoms render fully visible in cartoon mode.
    const cartoonMatState = getCartoonMaterialRenderState(getAtomBaseOpacity(), hasTransparentAtoms);
    const materialTransparent = isWireframe ? true : isCartoon ? cartoonMatState.transparent : instancedMaterialState.transparent;
    const materialAlphaHash = isWireframe ? false : isCartoon ? cartoonMatState.alphaHash : instancedMaterialState.alphaHash;
    const showOutlineForStyle =
        renderStyle === 'cartoon'
            ? shouldShowCartoonOutline(getAtomBaseOpacity(), hasTransparentAtoms)
            : renderStyle === 'standard'
                ? !hasTransparentAtoms
                : renderStyle !== 'soft' || showOutline;

    useLayoutEffect(() => {
        if (!meshRef.current) return;
        const material = meshRef.current.material as THREE.Material & { alphaHash: boolean };
        syncMaterialAlphaHash(material, materialAlphaHash);
        // renderStyle is in the deps so this re-runs after the material element
        // swaps (e.g. standard meshStandardMaterial → cartoon toonMaterial). That
        // SEEDS the new material's alphaHash tracker, so a later hide (alphaHash
        // false→true) is detected as a real change and the shader recompiles with
        // USE_ALPHAHASH. Without it, hiding an atom after a standard→cartoon swap
        // would not recompile and the hidden atom would stay visible.
    }, [materialAlphaHash, renderStyle]);

    if (!structureData) return null;

    const count = customPositions ? customPositions.length : structureData.structure.positions.length;
    const labelPositions = customPositions || displayPositions(structureData.structure);
    const labelSymbols = structureData.structure.symbols;

    const handleClick = (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (!viewControls.enableSelection) return;

        if (e.instanceId !== undefined) {
            if (selectionMode === 'slab' && clusterIndices && clusterIndices[e.instanceId] !== undefined) {
                setSlabTarget(clusterIndices[e.instanceId]);
            } else {
                toggleSelection(e.instanceId);
            }
        }
    };

    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(e.instanceId ?? null);
        // Give the implicit click-to-select affordance a visible cursor, but only
        // when selection is actually enabled (otherwise hovering does nothing).
        if (viewControls.enableSelection) document.body.style.cursor = 'pointer';
    };

    const handlePointerOut = () => {
        setHovered(null);
        document.body.style.cursor = '';
    };

    const isHoveredValid = hovered !== null && atomsData[hovered];

    const shouldCastShadow = !isWireframe && renderStyle === 'soft';
    const outlineThickness = renderStyle === 'cartoon' 
        ? cartoonParams.outlineThickness 
        : renderStyle === 'standard' ? 1 : 2;

    const tooltipElement = isHoveredValid && (
        <Html position={atomsData[hovered].position}>
            <div style={{
                background: viewControls.tooltipTheme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                color: viewControls.tooltipTheme === 'dark' ? 'white' : 'black',
                padding: '8px',
                borderRadius: '4px',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                fontSize: '12px',
                fontFamily: 'monospace'
            }}>
                <div>{structureData.structure.symbols[hovered]}{elementIndices[hovered]} (No. {hovered + 1})</div>
                <div>[{atomsData[hovered].position.toArray().map(v => v.toFixed(3)).join(', ')}]</div>
            </div>
        </Html>
    );

    const atomMaterialKind = pickAtomMaterialKind(renderStyle);

    return (
        <>
        <instancedMesh
            // key intentionally depends only on `count`. Including displayMode
            // or renderStyle here would force a full mount/unmount of the
            // InstancedMesh whenever the user toggles render mode, reallocating
            // every GPU buffer for a large structure. Render-mode changes are
            // already handled by re-running setMatrixAt and updating material
            // props in place, so the mesh can be reused.
            key={count}
            ref={meshRef}
            args={[undefined, undefined, count]}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            castShadow={shouldCastShadow && showShadows}
            receiveShadow={shouldCastShadow && showShadows}
        >
            <sphereGeometry args={[0.5, lod.sphereSegments, lod.sphereSegments]}>
                <instancedBufferAttribute attach="attributes-instanceAlpha" args={[alphaArray, 1]} />
            </sphereGeometry>
            {atomMaterialKind === 'toon' ? (
                // Per-instance color flows setColorAt -> instanceColor -> the toon
                // shader's `vTint` varying (resolved vertex-side, where three.js
                // exposes USE_INSTANCING_COLOR). Per-instance opacity flows through
                // instanceAlpha; uOpacity stays 1 so the shader uses vAlpha alone.
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
                    transparent={materialTransparent}
                    alphaHash={materialAlphaHash}
                    opacity={isWireframe ? 0 : 1}
                    roughness={renderStyle === 'standard' ? 0.3 : 1}
                    onBeforeCompile={injectAlphaToStandardMaterial}
                />
            )}
            {tooltipElement}
            {(isCartoon || !isWireframe) && showOutlineForStyle && lod.showOutlines && <Outlines thickness={outlineThickness} color="black" />}
        </instancedMesh>
        <AtomLabels symbols={labelSymbols} positions={labelPositions} showLabels={showLabels && lod.showLabels} />
        </>
    );
};

export default Atoms;
