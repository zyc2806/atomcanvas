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
    getCartoonMaterialRenderState,
    getInstancedMaterialRenderState,
    isOpacityTransparent,
    shouldShowCartoonOutline,
} from './materials/opacityPolicy';
import { syncMaterialAlphaHash } from './materials/materialUpdate';
import AtomLabels from './AtomLabels';

interface AtomsProps {
    customPositions?: [number, number, number][];
    radiusOverrides?: { [i: number]: number };
    colorOverrides?: { [i: number]: string };
    opacityOverrides?: { [i: number]: number };
}

const Atoms: React.FC<AtomsProps> = ({ customPositions, radiusOverrides, colorOverrides, opacityOverrides }) => {
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
        const positions = customPositions || structureData.structure.positions;
        const symbols = structureData.structure.symbols;
        const wireframeHitScale = 0.3;

        return positions.map((pos, i) => {
            const atomicNumber = getAtomicNumber(symbols[i]);
            const radius = (radiiData[atomicNumber] || 0.5) * (radiusOverrides?.[i] ?? 1);
            const baseScale = radius * atomScale * 2;
            const scale = displayMode === 'wireframe' ? baseScale * wireframeHitScale : baseScale;

            return {
                position: new THREE.Vector3(pos[0], pos[1], pos[2]),
                scale,
                color: getAtomColor(i, symbols[i]),
                opacity: renderStyle === 'cartoon' ? getAtomBaseOpacity() : getAtomOpacity(i),
            };
        });
    }, [structureData, customPositions, atomScale, displayMode, getAtomBaseOpacity, getAtomColor, getAtomOpacity, renderStyle, radiusOverrides]);

    const alphaArray = useMemo(() => {
        if (!structureData) return new Float32Array(0);
        const positions = customPositions || structureData.structure.positions;
        const count = positions.length;
        const array = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            array[i] = getAtomOpacity(i);
        }
        return array;
    }, [structureData, customPositions, getAtomOpacity]);

    useLayoutEffect(() => {
        if (!meshRef.current || renderStyle === 'cartoon') return;
        const alphaAttribute = meshRef.current.geometry.getAttribute('instanceAlpha') as THREE.BufferAttribute | undefined;
        if (alphaAttribute && alphaAttribute.array.length === alphaArray.length) {
            alphaAttribute.copyArray(alphaArray);
            alphaAttribute.needsUpdate = true;
        }
    }, [alphaArray, renderStyle]);

    useLayoutEffect(() => {
        if (!structureData || !meshRef.current || renderStyle === 'cartoon') return;
        
        const positions = customPositions || structureData.structure.positions;
        const symbols = structureData.structure.symbols;
        const count = positions.length;
        const dummy = new THREE.Object3D();

        const wireframeHitScale = 0.3;

        for (let i = 0; i < count; i++) {
            const [x, y, z] = positions[i];
            const atomicNumber = getAtomicNumber(symbols[i]);
            const radius = (radiiData[atomicNumber] || 0.5) * (radiusOverrides?.[i] ?? 1);
            const baseScale = radius * atomScale * 2;
            const scale = displayMode === 'wireframe' ? baseScale * wireframeHitScale : baseScale;

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
    const hasTransparentAtoms = atomsData.some((atom) => isOpacityTransparent(atom.opacity));
    const instancedMaterialState = getInstancedMaterialRenderState(renderStyle, hasTransparentAtoms);
    const materialTransparent = isWireframe ? true : instancedMaterialState.transparent;
    const materialAlphaHash = isWireframe ? false : instancedMaterialState.alphaHash;
    const showOutlineForStyle =
        renderStyle === 'standard' ? !hasTransparentAtoms : renderStyle !== 'soft' || showOutline;

    useLayoutEffect(() => {
        if (!meshRef.current || renderStyle === 'cartoon') return;
        const material = meshRef.current.material as THREE.Material & { alphaHash: boolean };
        syncMaterialAlphaHash(material, materialAlphaHash);
    }, [materialAlphaHash, renderStyle]);

    if (!structureData) return null;

    const count = customPositions ? customPositions.length : structureData.structure.positions.length;
    const labelPositions = customPositions || structureData.structure.positions;
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

    const handleAtomClick = (index: number) => (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (!viewControls.enableSelection) return;

        if (selectionMode === 'slab' && clusterIndices && clusterIndices[index] !== undefined) {
            setSlabTarget(clusterIndices[index]);
        } else {
            toggleSelection(index);
        }
    };

    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(e.instanceId ?? null);
    };

    const handleAtomPointerOver = (index: number) => (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(index);
    };

    const handlePointerOut = () => {
        setHovered(null);
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

    if (renderStyle === 'cartoon') {
        return (
            <group>
                {atomsData.map((atom, index) => (
                    <mesh
                        key={`atom-${index}`}
                        position={atom.position}
                        scale={[atom.scale, atom.scale, atom.scale]}
                        onClick={handleAtomClick(index)}
                        onPointerOver={handleAtomPointerOver(index)}
                        onPointerOut={handlePointerOut}
                    >
                        <sphereGeometry args={[0.5, 32, 32]} />
                        {(() => {
                            const materialState = getCartoonMaterialRenderState(atom.opacity);
                            return (
                        <toonHighlightMaterial
                            transparent={materialState.transparent}
                            depthWrite={materialState.depthWrite}
                            alphaHash={materialState.alphaHash}
                            onUpdate={(material) => {
                                syncMaterialAlphaHash(material as THREE.Material & { alphaHash: boolean }, materialState.alphaHash);
                            }}
                            uColor={atom.color}
                            uLightDir={toonLightDir}
                            uLightIntensity={sceneSettings.globalBrightness}
                            uShadowThreshold={cartoonParams.shadowThreshold}
                            uHighlightThreshold={cartoonParams.highlightThreshold}
                            uShadowBrightness={cartoonParams.shadowBrightness}
                            uOpacity={atom.opacity}
                        />
                            );
                        })()}
                        {shouldShowCartoonOutline(atom.opacity) && (
                            <Outlines thickness={outlineThickness} color="black" />
                        )}
                    </mesh>
                ))}
                {tooltipElement}
                <AtomLabels symbols={labelSymbols} positions={labelPositions} showLabels={showLabels} />
            </group>
        );
    }

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
            <sphereGeometry args={[0.5, 32, 32]}>
                <instancedBufferAttribute attach="attributes-instanceAlpha" args={[alphaArray, 1]} />
            </sphereGeometry>
            <meshStandardMaterial 
                transparent={materialTransparent}
                alphaHash={materialAlphaHash}
                opacity={isWireframe ? 0 : 1} 
                roughness={renderStyle === 'standard' ? 0.3 : 1}
                onBeforeCompile={injectAlphaToStandardMaterial}
            />
            {tooltipElement}
            {!isWireframe && showOutlineForStyle && <Outlines thickness={outlineThickness} color="black" />}
        </instancedMesh>
        <AtomLabels symbols={labelSymbols} positions={labelPositions} showLabels={showLabels} />
        </>
    );
};

export default Atoms;
