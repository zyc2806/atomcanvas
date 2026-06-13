import React, { useRef } from 'react';
import { DirectionalLight, SpotLight } from 'three';
import useStructureStore from '../../../store/useStructureStore';

const Lighting: React.FC = () => {
  const { sceneSettings, viewControls, visParams } = useStructureStore();
  const { ambientLight, keyLight, fillLight, rimLight, globalBrightness } = sceneSettings;
  const { showShadows } = viewControls;

  const keyLightRef = useRef<DirectionalLight>(null);
  const fillLightRef = useRef<DirectionalLight>(null);
  const rimLightRef = useRef<SpotLight>(null);

  if (visParams.renderStyle === 'cartoon') {
    return null;
  }

  // Apply global brightness multiplier
  const getIntensity = (baseIntensity: number) => baseIntensity * globalBrightness;

  return (
    <>
      {/* Ambient Light - Always present for base illumination */}
      {ambientLight.enabled && (
        <ambientLight 
          intensity={getIntensity(ambientLight.intensity)} 
          color={ambientLight.color} 
        />
      )}

      {/* Key Light - Main directional light with shadows */}
      {keyLight.enabled && (
        <directionalLight
          ref={keyLightRef}
          position={keyLight.position}
          intensity={getIntensity(keyLight.intensity)}
          color={keyLight.color}
          castShadow={showShadows}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={50}
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
        />
      )}

      {/* Fill Light - Secondary directional, softer, no shadow */}
      {fillLight.enabled && (
        <directionalLight
          ref={fillLightRef}
          position={fillLight.position}
          intensity={getIntensity(fillLight.intensity)}
          color={fillLight.color}
          castShadow={false}
        />
      )}

      {/* Rim Light - Back/edge light using SpotLight for more focused effect */}
      {rimLight.enabled && (
        <spotLight
          ref={rimLightRef}
          position={rimLight.position}
          intensity={getIntensity(rimLight.intensity)}
          color={rimLight.color}
          angle={0.6}
          penumbra={0.5}
          castShadow={false}
        />
      )}
    </>
  );
};

export default Lighting;
