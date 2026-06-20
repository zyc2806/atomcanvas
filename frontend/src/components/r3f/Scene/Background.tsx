import React, { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Color } from 'three';
import useStructureStore from '../../../store/useStructureStore';

const Background: React.FC = () => {
  const { sceneSettings, viewControls } = useStructureStore();
  const { background } = sceneSettings;
  const { forceTransparentBackground } = viewControls;

  const { gl } = useThree();

  useLayoutEffect(() => {
    const previousColor = new Color();
    gl.getClearColor(previousColor);
    const previousAlpha = gl.getClearAlpha();

    const nextColor = new Color(background.solidColor);
    gl.setClearColor(nextColor, forceTransparentBackground ? 0 : 1);

    return () => {
      gl.setClearColor(previousColor, previousAlpha);
    };
  }, [background.solidColor, forceTransparentBackground, gl]);

  return null;
};

export default Background;
