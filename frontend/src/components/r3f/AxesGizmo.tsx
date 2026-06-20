import React, { useMemo } from 'react';
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Vector3 } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import useStructureStore from '../../store/useStructureStore';
import { resolveGizmoTargetCenter } from './axesGizmoUtils';

const AXIS_COLORS = {
    x: '#ff3653',
    y: '#8bdc00',
    z: '#2c8fff'
};

interface AxisVisualProps {
    direction: Vector3;
    color: string;
    label?: string;
    isSolid: boolean;
    onClick: (e: ThreeEvent<MouseEvent>) => void;
}

const AxisLabelSprite: React.FC<{ label: string }> = ({ label }) => {
    const texture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        ctx.clearRect(0, 0, 64, 64);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 32, 33);

        const tex = new CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }, [label]);

    if (!texture) {
        return null;
    }

    return (
        <sprite position={[0, 0, 0]} scale={[0.55, 0.55, 0.55]}>
            <spriteMaterial map={texture} transparent depthWrite={false} depthTest={false} toneMapped={false} />
        </sprite>
    );
};

const AxisVisual: React.FC<AxisVisualProps> = ({ 
    direction, 
    color, 
    label, 
    isSolid,
    onClick
}) => {
    // Position the sphere at the end of the direction vector
    const position = useMemo(() => direction.clone().normalize().multiplyScalar(1.2), [direction]);

    const geometry = useMemo(() => {
        const geo = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), position]);
        const lineDistance = new Float32BufferAttribute([0, position.length()], 1);
        geo.setAttribute('lineDistance', lineDistance);
        return geo;
    }, [position]);

    return (
        <group onClick={onClick}>
            {/* The Line */}
            <line>
                <primitive object={geometry} attach="geometry" />
                {isSolid ? (
                    <lineBasicMaterial color={color} toneMapped={false} />
                ) : (
                    <lineDashedMaterial 
                        color={color} 
                        dashSize={0.1} 
                        gapSize={0.05} 
                        toneMapped={false} 
                        opacity={0.5}
                        transparent
                    />
                )}
            </line>

            {/* The Sphere */}
            <group position={position}>
                {isSolid ? (
                    // Solid Sphere (+Axes)
                    <mesh>
                        <sphereGeometry args={[0.15, 32, 32]} />
                        <meshBasicMaterial color={color} toneMapped={false} />
                    </mesh>
                ) : (
                    // Hollow Sphere (-Axes)
                    <group>
                        {/* Transparent Shell */}
                        <mesh>
                            <sphereGeometry args={[0.15, 32, 32]} />
                            <meshBasicMaterial 
                                color={color} 
                                transparent 
                                opacity={0.3} 
                                toneMapped={false} 
                                depthWrite={false} 
                            />
                        </mesh>
                        {/* Wireframe/Edges */}
                        <mesh>
                            <sphereGeometry args={[0.15, 16, 16]} />
                            <meshBasicMaterial 
                                color={color} 
                                wireframe 
                                transparent 
                                opacity={0.5} 
                                toneMapped={false} 
                            />
                        </mesh>
                        {/* Invisible Hit Sphere */}
                        <mesh visible={false}>
                            <sphereGeometry args={[0.2, 16, 16]} />
                            <meshBasicMaterial />
                        </mesh>
                    </group>
                )}

                {label && <AxisLabelSprite label={label} />}
            </group>
        </group>
    );
};

const AxesGizmo: React.FC = () => {
    const { structureData, viewControls, triggerCameraView, viewTarget } = useStructureStore();
    const { axesLabels } = viewControls;

    const targetCenter = useMemo(() => resolveGizmoTargetCenter({
        viewTarget,
        structure: structureData?.structure,
    }), [viewTarget, structureData]);

    const axes = useMemo(() => {
        const mode = axesLabels;
        const cell = structureData?.structure?.cell;
        
        type AxisData = { 
            dir: Vector3; 
            color: string; 
            label?: string; 
            isSolid: boolean; 
        };
        
        const result: AxisData[] = [];

        if (mode === 'abc' && cell && cell.length === 3) {
            const validCell = cell.some(row => row.some(val => val !== 0));
            if (validCell) {
                // ABC Mode: 6 axes (3 Positive Solid, 3 Negative Dashed)
                
                // Positive
                result.push({ dir: new Vector3(...cell[0]), color: AXIS_COLORS.x, label: 'a', isSolid: true });
                result.push({ dir: new Vector3(...cell[1]), color: AXIS_COLORS.y, label: 'b', isSolid: true });
                result.push({ dir: new Vector3(...cell[2]), color: AXIS_COLORS.z, label: 'c', isSolid: true });

                // Negative
                result.push({ dir: new Vector3(...cell[0]).negate(), color: AXIS_COLORS.x, isSolid: false });
                result.push({ dir: new Vector3(...cell[1]).negate(), color: AXIS_COLORS.y, isSolid: false });
                result.push({ dir: new Vector3(...cell[2]).negate(), color: AXIS_COLORS.z, isSolid: false });
            }
        } else {
            // XYZ Mode: 6 axes
            
            // Positive
            result.push({ dir: new Vector3(1, 0, 0), color: AXIS_COLORS.x, label: 'X', isSolid: true });
            result.push({ dir: new Vector3(0, 1, 0), color: AXIS_COLORS.y, label: 'Y', isSolid: true });
            result.push({ dir: new Vector3(0, 0, 1), color: AXIS_COLORS.z, label: 'Z', isSolid: true });

            // Negative
            result.push({ dir: new Vector3(-1, 0, 0), color: AXIS_COLORS.x, isSolid: false });
            result.push({ dir: new Vector3(0, -1, 0), color: AXIS_COLORS.y, isSolid: false });
            result.push({ dir: new Vector3(0, 0, -1), color: AXIS_COLORS.z, isSolid: false });
        }

        return result;
    }, [structureData, axesLabels]);

    const handleAxisClick = (direction: Vector3) => (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const target = new Vector3(...targetCenter);
        // Camera position: target + direction * distance (20 units)
        const position = target.clone().add(direction.clone().normalize().multiplyScalar(20));
        
        // Calculate robust up vector
        // If roughly vertical (parallel to Y), use Z-axis up. Otherwise use Y-axis up.
        const up: [number, number, number] = Math.abs(direction.y) > 0.9 
            ? [0, 0, 1] 
            : [0, 1, 0];

        triggerCameraView(
            position.toArray() as [number, number, number], 
            target.toArray() as [number, number, number],
            true,
            up
        );
    };

    return (
        <group scale={40}> {/* Scale up because GizmoHelper scales down */}
            {axes.map((axis, i) => (
                <AxisVisual 
                    key={i} 
                    direction={axis.dir} 
                    color={axis.color} 
                    label={axis.label}
                    isSolid={axis.isSolid}
                    onClick={handleAxisClick(axis.dir)}
                />
            ))}
            {/* Central sphere */}
            <mesh>
                <sphereGeometry args={[0.1, 16, 16]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
            </mesh>
        </group>
    );
};

export default AxesGizmo;
