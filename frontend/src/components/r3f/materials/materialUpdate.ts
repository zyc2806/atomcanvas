import type * as THREE from 'three';

type AlphaHashMaterial = THREE.Material & {
  alphaHash: boolean;
  userData: Record<string, unknown>;
};

const ALPHA_HASH_STATE_KEY = '__alphaHashState';

export const syncMaterialAlphaHash = (
  material: AlphaHashMaterial | null | undefined,
  nextAlphaHash: boolean
): void => {
  if (!material) return;

  const previousAlphaHash = material.userData[ALPHA_HASH_STATE_KEY];
  if (typeof previousAlphaHash === 'boolean' && previousAlphaHash !== nextAlphaHash) {
    material.needsUpdate = true;
  }

  material.alphaHash = nextAlphaHash;
  material.userData[ALPHA_HASH_STATE_KEY] = nextAlphaHash;
};
