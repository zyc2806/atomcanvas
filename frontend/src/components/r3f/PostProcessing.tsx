import React from 'react';
import * as THREE from 'three';
import { EffectComposer, N8AO } from '@react-three/postprocessing';
import type { CaptureHandle } from '../../services/captureHandle';

interface PostProcessingProps {
  shouldEnableStandardAO: boolean;
  setComposer: (composer: CaptureHandle['composer']) => void;
}

const PostProcessing: React.FC<PostProcessingProps> = ({ shouldEnableStandardAO, setComposer }) => {
  return (
    <EffectComposer
      ref={(instance) => {
        // Callback ref: receives the postprocessing
        // EffectComposer instance on mount and null on
        // unmount (renderStyle toggle), keeping the capture
        // handle's composer in sync.
        setComposer((instance as unknown as CaptureHandle['composer']) ?? null);
      }}
    >
      <N8AO
        aoRadius={0.4}
        intensity={shouldEnableStandardAO ? 1 : 0}
        distanceFalloff={2}
        color={new THREE.Color('black')}
      />
    </EffectComposer>
  );
};

export default PostProcessing;
