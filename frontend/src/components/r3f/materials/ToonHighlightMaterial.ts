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
    varying vec3 vNormal;
    varying float vAlpha;
    #include <common>
    #ifdef USE_INSTANCING
      attribute float instanceAlpha;
    #endif

    void main() {
      vNormal = normalize(normalMatrix * normal);
      #ifdef USE_INSTANCING
        vAlpha = instanceAlpha;
      #else
        vAlpha = 1.0;
      #endif
      #ifdef USE_ALPHAHASH
        vPosition = vec3(position);
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  `
    uniform vec3 uColor;
    uniform vec3 uLightDir;
    uniform float uLightIntensity;
    uniform float uShadowThreshold;
    uniform float uHighlightThreshold;
    uniform float uShadowBrightness;
    uniform float uOpacity;
    varying vec3 vNormal;
    varying float vAlpha;
    #include <common>
    #include <alphahash_pars_fragment>

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(uLightDir);
      float diffuse = dot(normal, lightDir);
      
      vec3 baseColor = uColor * uLightIntensity;
      
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
