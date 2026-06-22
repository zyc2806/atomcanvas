import React, { useLayoutEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Outlines } from '@react-three/drei';
import useStructureStore from '../../store/useStructureStore';
import type { StandardStructureObject } from '../../types/store';
import useAtomColors from '../../hooks/useAtomColors';
import './materials/ToonHighlightMaterial';

import { getNearestAtomIndexToRing, aromaticInstancedMeshKey, applyAromaticRingInstances, resolveAromaticRingColor } from './aromaticRingsUtils';
import { ringTubeRadius } from '../../utils/ringGeometry';

interface AromaticRingsProps {
    structure?: StandardStructureObject;
}

interface RingData {
    key: string;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
    color: THREE.Color;
}

const AromaticRings: React.FC<AromaticRingsProps> = ({ structure }) => {
    const { structureData, viewControls, visParams, sceneSettings, activeTabId } = useStructureStore();
    const { getAtomBaseColor } = useAtomColors();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { showBonds, showShadows, showAromaticRings } = viewControls;
    const { renderStyle, cartoonParams, bondRadius } = visParams;
    // Aromatic torus tube tracks the bond radius (shared with the glb exporter),
    // so the Radius slider thickens the ring "donut" alongside the bonds.
    const ringTube = ringTubeRadius(bondRadius);

    const activeStructure = structure || structureData;

    const rings = useMemo(() => {
        if (!activeStructure?.visualization?.rings) return [];
        return activeStructure.visualization.rings;
    }, [activeStructure]);

    const toonLightDir = useMemo(() => {
        const pos = sceneSettings.keyLight.position;
        return new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();
    }, [sceneSettings.keyLight.position]);

    const processedRings = useMemo((): RingData[] => {
        if (rings.length === 0) return [];

        const data: RingData[] = [];
        const defaultNormal = new THREE.Vector3(0, 0, 1);
        const symbols = activeStructure?.structure?.symbols || [];
        const rawPositions = activeStructure?.structure?.positions || [];
        const positions: [number, number, number][] = [];
        for (const pos of rawPositions) {
            if (pos.length >= 3) {
                positions.push([pos[0], pos[1], pos[2]]);
            }
        }

        for (let i = 0; i < rings.length; i++) {
            const [center, normal, radius] = rings[i];
            if (center.length < 3 || normal.length < 3) continue;
            
            const position = new THREE.Vector3(center[0], center[1], center[2]);
            const ringNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
            const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultNormal, ringNormal);
            
            // Scale logic from original code: radius * 0.6
            const s = radius * 0.6;
            const scale = new THREE.Vector3(s, s, s);
            const ringCenter: [number, number, number] = [center[0], center[1], center[2]];
            const nearestAtomIndex = getNearestAtomIndexToRing(ringCenter, positions);
            const color = resolveAromaticRingColor(nearestAtomIndex, symbols, getAtomBaseColor);

            data.push({
                key: `ring-${i}`,
                position,
                quaternion,
                scale,
                color
            });
        }
        return data;
    }, [rings, activeStructure, getAtomBaseColor]);

    useLayoutEffect(() => {
        if (!meshRef.current || renderStyle === 'cartoon') return;
        if (processedRings.length === 0) return;
        applyAromaticRingInstances(meshRef.current, processedRings);
        // `showBonds` is a dependency on purpose: the vdw display mode sets
        // showBonds=false (which unmounts this InstancedMesh via the early return
        // below), and ball-stick/wireframe set it back to true, REMOUNTING the mesh.
        // A fresh InstancedMesh starts with IDENTITY matrices (all rings at the world
        // origin, scale 1); processedRings/renderStyle don't change across that toggle,
        // so without showBonds here the remounted rings would stay stuck at the origin.
        // showAromaticRings is here for the same reason: toggling it off then on
        // unmounts/remounts the mesh (via the early return below), and the fresh
        // InstancedMesh needs its matrices repopulated.
    }, [processedRings, renderStyle, showBonds, showAromaticRings]);

    // showAromaticRings off: hide the torus (Bonds.tsx redraws the ring as Kekulé
    // single/double bonds instead).
    if (!showBonds || !showAromaticRings || rings.length === 0) return null;

    const shouldCastShadow = renderStyle === 'soft' && showShadows;
    const outlineThickness = renderStyle === 'cartoon' ? cartoonParams.outlineThickness : 1;

    if (renderStyle === 'cartoon') {
        return (
            <group>
                {processedRings.map((ring) => (
                    <mesh
                        key={ring.key}
                        position={ring.position}
                        quaternion={ring.quaternion}
                        scale={[ring.scale.x, ring.scale.y, ring.scale.z]}
                    >
                        <torusGeometry args={[1.0, ringTube, 16, 64]} />
                        <toonHighlightMaterial
                            uColor={ring.color}
                            uLightDir={toonLightDir}
                            uLightIntensity={sceneSettings.globalBrightness}
                            uShadowThreshold={cartoonParams.shadowThreshold}
                            uHighlightThreshold={cartoonParams.highlightThreshold}
                            uShadowBrightness={cartoonParams.shadowBrightness}
                        />
                        <Outlines thickness={outlineThickness} color="black" />
                    </mesh>
                ))}
            </group>
        );
    }

    return (
        <instancedMesh
            // Structure-identity remount key. The per-instance matrices/colors are
            // written imperatively (setMatrixAt/setColorAt), and in this R3F version a
            // change to `args` alone does NOT reconstruct the mesh — so without a key,
            // loading a 2nd structure reuses the old buffers and leaves stale tori
            // floating (rendered black via a zeroed instanceColor). See BUG 2.
            key={aromaticInstancedMeshKey(activeTabId, processedRings.length)}
            ref={meshRef}
            args={[undefined, undefined, processedRings.length]}
            castShadow={shouldCastShadow}
            receiveShadow={shouldCastShadow}
        >
            <torusGeometry args={[1.0, ringTube, 16, 64]} />
            <meshStandardMaterial roughness={renderStyle === 'standard' ? 0.3 : 1} />
            {renderStyle === 'standard' && <Outlines thickness={1} color="black" />}
        </instancedMesh>
    );
};

export default AromaticRings;
