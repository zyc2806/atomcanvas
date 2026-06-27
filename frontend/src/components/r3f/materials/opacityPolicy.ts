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

export const getCartoonMaterialRenderState = (
  opacity: number,
  hasHiddenAtoms = false
): CartoonMaterialRenderState => {
  void opacity;
  // Cartoon stays opaque (no partial-transparency blending), but when atoms are
  // hidden (alpha 0) it must enable alpha-hash so the toon shader discards those
  // fully-transparent instances instead of writing them opaque.
  return {
    transparent: false,
    depthWrite: true,
    alphaHash: hasHiddenAtoms,
  };
};

export const shouldShowCartoonOutline = (
  opacity: number,
  hasHiddenAtoms = false
): boolean => {
  void opacity;
  // Drop the inverted-hull outline when any atom is hidden (mirrors standard
  // mode's `!hasTransparentAtoms` gate); otherwise the outline shell of a
  // discarded atom would linger as a black blob at its position.
  return !hasHiddenAtoms;
};
