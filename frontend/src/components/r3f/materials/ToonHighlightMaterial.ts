import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';
import type { ThreeElement } from '@react-three/fiber';

export interface ToonHighlightMaterialUniforms {
  uColor: THREE.Color;
  uLightDir: THREE.Vector3;
  uLightIntensity: number;
  uShadowThreshold: number;
  uHighlightThreshold: number;
  uShadowBrightness: number;
  uOpacity: number;
}

export const ToonHighlightMaterial = shaderMaterial(
  {
    uColor: new THREE.Color(0.5, 0.5, 0.5),
    uLightDir: new THREE.Vector3(1, 1, 1),
    uLightIntensity: 1.0,
    uShadowThreshold: 0.3,
    uHighlightThreshold: 0.97,
    uShadowBrightness: 0.5,
    uOpacity: 1.0,
  },
  `
    uniform vec3 uColor;
    varying vec3 vNormal;
    varying float vAlpha;
    varying vec3 vTint;
    #include <common>
    #ifdef USE_INSTANCING
      attribute float instanceAlpha;
    #endif

    void main() {
      // Per-instance normal: fold the instanceMatrix rotation/scale in before
      // normalMatrix, mirroring three's <defaultnormal_vertex>. Bonds carry rotation
      // on the shared InstancedMesh, so without this their shading would be wrong.
      vec3 toonObjectNormal = vec3(normal);
      #ifdef USE_INSTANCING
        mat3 toonInstanceM = mat3(instanceMatrix);
        toonObjectNormal /= vec3(dot(toonInstanceM[0], toonInstanceM[0]), dot(toonInstanceM[1], toonInstanceM[1]), dot(toonInstanceM[2], toonInstanceM[2]));
        toonObjectNormal = toonInstanceM * toonObjectNormal;
      #endif
      vNormal = normalize(normalMatrix * toonObjectNormal);
      #ifdef USE_INSTANCING
        vAlpha = instanceAlpha;
      #else
        vAlpha = 1.0;
      #endif
      // three.js injects USE_INSTANCING_COLOR (and 'attribute vec3 instanceColor;')
      // into the VERTEX prefix only, never the fragment prefix. So the per-instance
      // tint must be resolved here and forwarded as a plain varying. The non-instanced
      // path (and instanced meshes without an instanceColor buffer) falls back to uColor.
      #ifdef USE_INSTANCING_COLOR
        vTint = instanceColor;
      #else
        vTint = uColor;
      #endif
      #ifdef USE_ALPHAHASH
        vPosition = vec3(position);
      #endif
      // Per-instance position: fold instanceMatrix in before modelViewMatrix,
      // mirroring three's <project_vertex>. Without this, every instance collapses
      // onto the object-space origin (overlapping spheres + coincident black outlines).
      vec4 mvPosition = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  `
    uniform vec3 uLightDir;
    uniform float uLightIntensity;
    uniform float uShadowThreshold;
    uniform float uHighlightThreshold;
    uniform float uShadowBrightness;
    uniform float uOpacity;
    varying vec3 vNormal;
    varying float vAlpha;
    varying vec3 vTint;
    #include <common>
    #include <alphahash_pars_fragment>

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(uLightDir);
      float diffuse = dot(normal, lightDir);

      vec3 baseColor = vTint * uLightIntensity;
      
      vec3 finalColor;
      if (diffuse > uHighlightThreshold) {
        finalColor = vec3(1.0, 1.0, 1.0);
      } else if (diffuse > uShadowThreshold) {
        finalColor = baseColor;
      } else {
        finalColor = baseColor * uShadowBrightness;
      }
      
      vec4 diffuseColor = vec4(finalColor, uOpacity * vAlpha);
      #include <alphahash_fragment>
      gl_FragColor = diffuseColor;
    }
  `
);

export const injectAlphaToStandardMaterial = (shader: { vertexShader: string; fragmentShader: string }) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `
    #include <common>
    #ifdef USE_INSTANCING
      attribute float instanceAlpha;
    #endif
    varying float vAlpha;
    `
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `
    #include <begin_vertex>
    #ifdef USE_INSTANCING
      vAlpha = instanceAlpha;
    #else
      vAlpha = 1.0;
    #endif
    `
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `
    #include <common>
    varying float vAlpha;
    `
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `
    #include <color_fragment>
    diffuseColor.a *= vAlpha;
    `
  );
};

extend({ ToonHighlightMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    toonHighlightMaterial: ThreeElement<typeof ToonHighlightMaterial>;
  }
}
