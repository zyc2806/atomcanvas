export interface CartoonMaterialRenderState {
  transparent: boolean;
  depthWrite: boolean;
  alphaHash: boolean;
}

export interface InstancedMaterialRenderState {
  transparent: boolean;
  alphaHash: boolean;
}

export const OPAQUE_EPSILON = 0.999;

export const resolveBondHalfOpacity = (
  atomOpacity: number,
  bondOpacityOverride: number | null | undefined
): number => {
  if (bondOpacityOverride === null || bondOpacityOverride === undefined) {
    return atomOpacity;
  }
  return bondOpacityOverride;
};

export const isOpacityTransparent = (opacity: number): boolean => opacity < OPAQUE_EPSILON;

const hasTransparentEntries = (
  overrides: Record<string, number> | Record<number, number> | null | undefined
): boolean => {
  if (!overrides) return false;
  return Object.values(overrides).some((opacity) => isOpacityTransparent(Number(opacity)));
};

export const hasAnyTransparentOverrides = (
  atomOpacityOverrides: Record<number, number> | null | undefined,
  bondOpacityOverrides: Record<string, number> | null | undefined
): boolean =>
  hasTransparentEntries(atomOpacityOverrides) || hasTransparentEntries(bondOpacityOverrides);

export const getInstancedMaterialRenderState = (
  renderStyle: 'standard' | 'cartoon' | 'soft',
  hasTransparentEntries = false
): InstancedMaterialRenderState => {
  if (renderStyle === 'soft') {
    return {
      transparent: false,
      alphaHash: true,
    };
  }

  if (renderStyle === 'standard') {
    return {
      transparent: false,
      alphaHash: hasTransparentEntries,
    };
  }

  return {
    transparent: true,
    alphaHash: false,
  };
};

export const getCartoonMaterialRenderState = (opacity: number): CartoonMaterialRenderState => {
  void opacity;
  return {
    transparent: false,
    depthWrite: true,
    alphaHash: false,
  };
};

export const shouldShowCartoonOutline = (opacity: number): boolean => {
  void opacity;
  return true;
};
