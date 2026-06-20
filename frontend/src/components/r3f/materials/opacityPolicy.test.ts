import { describe, it, expect } from 'vitest';
import {
  OPAQUE_EPSILON,
  isOpacityTransparent,
  resolveBondHalfOpacity,
  hasAnyTransparentOverrides,
  getInstancedMaterialRenderState,
  getCartoonMaterialRenderState,
  shouldShowCartoonOutline,
} from './opacityPolicy';

describe('isOpacityTransparent', () => {
  it('treats fully opaque (1.0) as not transparent', () => {
    expect(isOpacityTransparent(1.0)).toBe(false);
  });

  it('treats values at/above the opaque epsilon as not transparent', () => {
    expect(isOpacityTransparent(OPAQUE_EPSILON)).toBe(false);
  });

  it('treats values below the opaque epsilon as transparent', () => {
    expect(isOpacityTransparent(OPAQUE_EPSILON - 0.001)).toBe(true);
    expect(isOpacityTransparent(0.5)).toBe(true);
    expect(isOpacityTransparent(0)).toBe(true);
  });
});

describe('resolveBondHalfOpacity', () => {
  it('falls back to the atom opacity when no override is set', () => {
    expect(resolveBondHalfOpacity(0.4, null)).toBe(0.4);
    expect(resolveBondHalfOpacity(0.4, undefined)).toBe(0.4);
  });

  it('uses the bond override when present (including 0)', () => {
    expect(resolveBondHalfOpacity(0.4, 0.9)).toBe(0.9);
    expect(resolveBondHalfOpacity(0.4, 0)).toBe(0);
  });
});

describe('hasAnyTransparentOverrides', () => {
  it('is false when there are no overrides', () => {
    expect(hasAnyTransparentOverrides(null, null)).toBe(false);
    expect(hasAnyTransparentOverrides({}, {})).toBe(false);
  });

  it('detects a transparent atom override', () => {
    expect(hasAnyTransparentOverrides({ 0: 0.5 }, null)).toBe(true);
  });

  it('detects a transparent bond override', () => {
    expect(hasAnyTransparentOverrides(null, { '0-1': 0.3 })).toBe(true);
  });

  it('ignores fully-opaque overrides', () => {
    expect(hasAnyTransparentOverrides({ 0: 1 }, { '0-1': 1 })).toBe(false);
  });
});

describe('getInstancedMaterialRenderState', () => {
  it('soft is opaque with alpha-hash', () => {
    expect(getInstancedMaterialRenderState('soft', true)).toEqual({
      transparent: false,
      alphaHash: true,
    });
  });

  it('standard is opaque, alpha-hash only when transparent entries exist', () => {
    expect(getInstancedMaterialRenderState('standard', false)).toEqual({
      transparent: false,
      alphaHash: false,
    });
    expect(getInstancedMaterialRenderState('standard', true)).toEqual({
      transparent: false,
      alphaHash: true,
    });
  });

  it('cartoon reports transparent without alpha-hash (the instanced path forces opaque)', () => {
    expect(getInstancedMaterialRenderState('cartoon', true)).toEqual({
      transparent: true,
      alphaHash: false,
    });
  });
});

describe('cartoon outline / material policy', () => {
  it('cartoon material state is opaque with depth write and no alpha-hash', () => {
    expect(getCartoonMaterialRenderState(0.5)).toEqual({
      transparent: false,
      depthWrite: true,
      alphaHash: false,
    });
  });

  it('cartoon outline is always shown regardless of opacity', () => {
    expect(shouldShowCartoonOutline(1)).toBe(true);
    expect(shouldShowCartoonOutline(0.2)).toBe(true);
  });
});
