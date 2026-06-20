import React, { useEffect, useRef, useState } from 'react';
import { TransformControls } from '@react-three/drei';
import type { Mesh } from 'three';
import useStructureStore from '../../../store/useStructureStore';

interface LightGizmoProps {
  lightName: 'keyLight' | 'fillLight' | 'rimLight';
  color: string;
}

const LightGizmo: React.FC<LightGizmoProps> = ({ lightName, color }) => {
  const { sceneSettings, setLight } = useStructureStore();
  const lightConfig = sceneSettings[lightName];
  const meshRef = useRef<Mesh | null>(null);
  const [transformObject, setTransformObject] = useState<Mesh | null>(null);

  const handleMeshRef = (node: Mesh | null) => {
    meshRef.current = node;
    setTransformObject((prev) => (prev === node ? prev : node));
  };

  // Sync mesh position with store
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(...lightConfig.position);
    }
  }, [lightConfig.position]);

  const handleDrag = () => {
    if (meshRef.current) {
      const pos = meshRef.current.position;
      setLight(lightName, {
        position: [pos.x, pos.y, pos.z]
      });
    }
  };

  if (!lightConfig.enabled) return null;

  return (
    <>
      <mesh ref={handleMeshRef} position={lightConfig.position}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>
      <TransformControls
        object={transformObject ?? undefined}
        mode="translate"
        onObjectChange={handleDrag}
        size={0.5}
      />
    </>
  );
};

const LightGizmos: React.FC = () => {
  const { sceneSettings } = useStructureStore();
  const { showLightGizmos } = sceneSettings;

  if (!showLightGizmos) return null;

  return (
    <>
      <LightGizmo lightName="keyLight" color="#ffcc00" />
      <LightGizmo lightName="fillLight" color="#00ccff" />
      <LightGizmo lightName="rimLight" color="#ff00cc" />
    </>
  );
};

export default LightGizmos;
