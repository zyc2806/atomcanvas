// CANARY: This test is tightly coupled to three.js's GLSL chunk names
// (#include <common>, #include <begin_vertex>, #include <color_fragment>).
// If three.js renames or restructures these chunks in a future upgrade, this
// test will break and needs to be updated alongside the injection logic in
// ToonHighlightMaterial.ts.

import { describe, it, expect } from 'vitest';
import { injectAlphaToStandardMaterial, ToonHighlightMaterial } from './ToonHighlightMaterial';

function makeShaders() {
    // Minimal vertex/fragment shaders that contain the chunk anchors that
    // three.js's MeshStandardMaterial uses; injectAlphaToStandardMaterial
    // does string-replace on these anchors.
    return {
        vertexShader: `
void main() {
  #include <common>
  vec3 transformed;
  #include <begin_vertex>
  gl_Position = vec4(transformed, 1.0);
}`,
        fragmentShader: `
void main() {
  #include <common>
  vec4 diffuseColor = vec4(1.0);
  #include <color_fragment>
  gl_FragColor = diffuseColor;
}`,
    };
}

describe('injectAlphaToStandardMaterial', () => {
    it('injects "attribute float instanceAlpha" into the vertex shader', () => {
        const shader = makeShaders();
        injectAlphaToStandardMaterial(shader);
        expect(shader.vertexShader).toContain('attribute float instanceAlpha');
    });

    it('injects "varying float vAlpha" into the vertex shader', () => {
        const shader = makeShaders();
        injectAlphaToStandardMaterial(shader);
        expect(shader.vertexShader).toContain('varying float vAlpha');
    });

    it('sets vAlpha = instanceAlpha in the vertex shader', () => {
        const shader = makeShaders();
        injectAlphaToStandardMaterial(shader);
        expect(shader.vertexShader).toContain('vAlpha = instanceAlpha');
    });

    it('injects "varying float vAlpha" into the fragment shader', () => {
        const shader = makeShaders();
        injectAlphaToStandardMaterial(shader);
        expect(shader.fragmentShader).toContain('varying float vAlpha');
    });

    it('applies the alpha via vAlpha in the fragment shader', () => {
        const shader = makeShaders();
        injectAlphaToStandardMaterial(shader);
        expect(shader.fragmentShader).toContain('diffuseColor.a *= vAlpha');
    });

    it('does not modify the original vertexShader string (mutates the object, not a new string)', () => {
        const shader = makeShaders();
        const originalVertex = shader.vertexShader;
        injectAlphaToStandardMaterial(shader);
        // The object property is replaced — the original variable is unchanged
        expect(shader.vertexShader).not.toBe(originalVertex);
        expect(shader.vertexShader).toContain('attribute float instanceAlpha');
    });

    it('preserves the original #include <common> chunk anchor in the vertex shader', () => {
        const shader = makeShaders();
        injectAlphaToStandardMaterial(shader);
        // After injection the chunk include must still be present (injected around it)
        expect(shader.vertexShader).toContain('#include <common>');
    });

    it('preserves the original #include <begin_vertex> chunk anchor in the vertex shader', () => {
        const shader = makeShaders();
        injectAlphaToStandardMaterial(shader);
        expect(shader.vertexShader).toContain('#include <begin_vertex>');
    });
});

// BUG 3: cartoon (toon) atoms/bonds were collapsed onto the origin (rendered black)
// because the toon vertex shader multiplied modelViewMatrix * position WITHOUT folding
// in the per-instance transform. Cartoon atoms/bonds live on the shared InstancedMesh
// (per-instance transform written via setMatrixAt), so the vertex shader MUST apply
// instanceMatrix to both the position and the normal — mirroring three's built-in
// <project_vertex> / <defaultnormal_vertex> chunks. These string-level assertions guard
// that path (GL-free: constructing a ShaderMaterial does not need a WebGL context).
describe('ToonHighlightMaterial vertex shader (instancing transform)', () => {
    const vertexSource = new ToonHighlightMaterial().vertexShader;

    it('applies the per-instance transform (instanceMatrix) to the vertex position', () => {
        // Must multiply instanceMatrix into the position before modelViewMatrix,
        // otherwise every instance renders at object-space position (origin), scale 1.
        expect(vertexSource).toContain('instanceMatrix *');
    });

    it('guards the instance transform behind USE_INSTANCING (non-instanced path still works)', () => {
        expect(vertexSource).toContain('#ifdef USE_INSTANCING');
    });

    it('builds gl_Position from a model-view position (projectionMatrix * mvPosition)', () => {
        // The collapsed form "modelViewMatrix * vec4(position, 1.0)" (no instanceMatrix)
        // is the bug; the fix routes through an mvPosition that can carry instanceMatrix.
        expect(vertexSource).not.toContain('modelViewMatrix * vec4(position, 1.0)');
    });

    it('REGRESSION: keeps the per-instance tint (vTint = instanceColor) path intact', () => {
        // The instanceColor path is correct (three injects USE_INSTANCING_COLOR vertex-only);
        // the fix must not touch it.
        expect(vertexSource).toContain('vTint = instanceColor');
    });
});
