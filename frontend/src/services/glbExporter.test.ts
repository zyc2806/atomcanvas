import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildExportScene, exportGlb, getElementData } from './glbExporter';

const structure = { symbols: ['O', 'H'], positions: [[0, 0, 0], [0.96, 0, 0]] };
const vis = { bonds: [[0, 1, 1]] as [number, number, number][] };
const style = { elements: {}, bondsStyle: { style: 'cylinder' as const, radius: 0.12, colorMode: 'element-split' as const } };
const elementData = {
  O: { color: [1, 0, 0] as [number, number, number], radius: 0.66 },
  H: { color: [1, 1, 1] as [number, number, number], radius: 0.31 },
};

describe('glbExporter', () => {
  it('builds one mesh group per element plus bonds', () => {
    const scene = buildExportScene(structure, vis, style, elementData);
    const names = scene.children.map((c) => c.name).sort();
    expect(names).toContain('atoms-O');
    expect(names).toContain('atoms-H');
    expect(names).toContain('bonds');
  });

  it('produces a binary glb (magic bytes glTF)', async () => {
    const scene = buildExportScene(structure, vis, style, elementData);
    const buf = await exportGlb(scene);
    expect(new TextDecoder().decode(new Uint8Array(buf, 0, 4))).toBe('glTF');
  });

  it('sizes sphere geometry to match the viewport radius formula', () => {
    const scene = buildExportScene(structure, vis, style, elementData);
    const oMesh = scene.children.find((c) => c.name === 'atoms-O') as THREE.Mesh;
    oMesh.geometry.computeBoundingSphere();
    // single O atom at origin, radius 0.66, no radiusScale -> bounding sphere ~0.66
    expect(oMesh.geometry.boundingSphere!.radius).toBeCloseTo(0.66, 3);
  });

  it('applies preset element overrides (color + radiusScale)', () => {
    const styled = {
      elements: { O: { color: '#00ff00', radiusScale: 2 } },
      bondsStyle: style.bondsStyle,
    };
    const scene = buildExportScene(structure, vis, styled, elementData);
    const oMesh = scene.children.find((c) => c.name === 'atoms-O') as THREE.Mesh;
    oMesh.geometry.computeBoundingSphere();
    expect(oMesh.geometry.boundingSphere!.radius).toBeCloseTo(1.32, 3);
    const mat = oMesh.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHexString()).toBe('00ff00');
  });

  it('getElementData builds element data from atomStyles + radii formula', () => {
    const atomStyles = {
      O: { color: '#ff0000', radius: 1.52 },
      H: { color: '#ffffff', radius: 1.2 },
    };
    const data = getElementData(['O', 'H', 'O'], atomStyles, 0.7);
    // radius = radii.json[atomicNumber] * atomScale; O=8 -> 0.66, H=1 -> 0.31
    expect(data.O.radius).toBeCloseTo(0.66 * 0.7, 5);
    expect(data.H.radius).toBeCloseTo(0.31 * 0.7, 5);
    const oColor = new THREE.Color(...data.O.color).getHexString();
    expect(oColor).toBe('ff0000');
  });
});
