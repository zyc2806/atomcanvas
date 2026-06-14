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

// --- Fidelity: bond orders + aromatic rings must survive the glb export ----
// The web viewer draws a double bond as two cylinders, a triple as three, and an
// aromatic ring as a torus (Bonds.tsx / AromaticRings.tsx). The glb export must
// match so a benzene exported for PowerPoint keeps its double bonds and donuts.

const cc = { symbols: ['C', 'C'], positions: [[0, 0, 0], [1.5, 0, 0]] };
const uniformStyle = {
  elements: {},
  bondsStyle: { style: 'cylinder' as const, radius: 0.12, colorMode: 'uniform' as const },
};
const ccData = {
  C: { color: [0.4, 0.4, 0.4] as [number, number, number], radius: 0.77 },
};

// Total vertex count across every bond-cylinder mesh (one merged mesh per color
// in uniform mode → a single mesh). Each cylinder has a fixed vertex count, so
// N cylinders → N× the vertices of one.
function bondVertexCount(scene: THREE.Scene): number {
  const bonds = scene.getObjectByName('bonds');
  if (!bonds) return 0;
  let total = 0;
  bonds.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) total += m.geometry.getAttribute('position').count;
  });
  return total;
}

function bondsBoundingBox(scene: THREE.Scene): THREE.Box3 {
  const bonds = scene.getObjectByName('bonds')!;
  const box = new THREE.Box3();
  bonds.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!);
    }
  });
  return box;
}

describe('glbExporter bond-order fidelity', () => {
  const order = (o: number) =>
    buildExportScene(cc, { bonds: [[0, 1, o]] }, uniformStyle, ccData);

  it('emits one cylinder for a single bond, two for a double', () => {
    expect(bondVertexCount(order(2))).toBe(2 * bondVertexCount(order(1)));
  });

  it('emits three cylinders for a triple bond', () => {
    expect(bondVertexCount(order(3))).toBe(3 * bondVertexCount(order(1)));
  });

  it('offsets the double-bond cylinders off the bond axis', () => {
    // bond runs along x; the two cylinders are pushed apart perpendicular to it,
    // so the double bond is wider across the bond than a single bond.
    const single = bondsBoundingBox(order(1));
    const double = bondsBoundingBox(order(2));
    const perpSingle = Math.max(single.max.y - single.min.y, single.max.z - single.min.z);
    const perpDouble = Math.max(double.max.y - double.min.y, double.max.z - double.min.z);
    expect(perpDouble).toBeGreaterThan(perpSingle + 1e-3);
  });
});

describe('glbExporter aromatic-ring fidelity', () => {
  const ring: [number[], number[], number] = [[0, 0, 0], [0, 0, 1], 1.4];

  it('exports a rings node when the visualization carries rings', () => {
    const scene = buildExportScene(cc, { bonds: [[0, 1, 1]], rings: [ring] }, uniformStyle, ccData);
    const rings = scene.getObjectByName('rings');
    expect(rings).toBeDefined();
    let meshes = 0;
    rings!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes += 1;
    });
    expect(meshes).toBeGreaterThan(0);
  });

  it('omits the rings node when there are no rings', () => {
    const scene = buildExportScene(cc, { bonds: [[0, 1, 1]], rings: [] }, uniformStyle, ccData);
    expect(scene.getObjectByName('rings')).toBeUndefined();
  });
});

describe('glbExporter robustness', () => {
  it('skips bonds whose atom positions are non-finite (mirrors the viewport guard)', () => {
    const broken = { symbols: ['C', 'C'], positions: [[0, 0, 0], [NaN, 0, 0]] };
    const scene = buildExportScene(broken, { bonds: [[0, 1, 1]] }, uniformStyle, ccData);
    expect(bondVertexCount(scene)).toBe(0);
  });
});
