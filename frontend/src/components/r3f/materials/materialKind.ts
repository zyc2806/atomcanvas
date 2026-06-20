import * as THREE from 'three';
import type { RenderStyle } from '../../../types/store';

export type AtomMaterialKind = 'toon' | 'standard';

/**
 * Picks the instanced material for the shared InstancedMesh path by render style.
 * Cartoon mode now shares the single InstancedMesh (per-instance color flows
 * through `setColorAt` -> `instanceColor` -> the toon shader's `vTint` varying),
 * so cartoon resolves to the toon material while every other style uses the
 * standard material.
 */
export const pickAtomMaterialKind = (renderStyle: RenderStyle): AtomMaterialKind =>
  renderStyle === 'cartoon' ? 'toon' : 'standard';

/**
 * Flattens per-instance colors into the RGB Float32Array layout consumed by
 * InstancedMesh.instanceColor (3 floats per instance, in the same order as the
 * instances). Useful for asserting the instance-color buffer in pure tests
 * without standing up a GL context.
 */
export const buildInstanceColors = (colors: THREE.Color[]): Float32Array => {
  const array = new Float32Array(colors.length * 3);
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    array[i * 3] = c.r;
    array[i * 3 + 1] = c.g;
    array[i * 3 + 2] = c.b;
  }
  return array;
};
