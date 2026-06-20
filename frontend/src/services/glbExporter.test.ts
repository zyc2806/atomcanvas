import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildExportScene, exportGlb, getElementData } from './glbExporter';

const structure = { symbols: ['O', 'H'], positions: [[0, 0, 0], [0.96, 0, 0]] };
const vis = { bonds: [[0, 1, 1]] as [number, number, number][] };
const style = { elements: {}, bondsStyle: { style: 'cylinder' as const, colorMode: 'element-split' as const }, bondRadius: 0.12 };
const elementData = {
  O: { color: [1, 0, 0] as [number, number, number], radius: 0.66 },
  H: { color: [1, 1, 1] as [number, number, number], radius: 0.31 },
};

// --- test helpers for the color+opacity bucket layout ---
function meshesInGroup(scene: THREE.Scene, name: string): THREE.Mesh[] {
  const g = scene.getObjectByName(name);
  if (!g) return [];
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}
function meshByColor(scene: THREE.Scene, group: string, hex: string): THREE.Mesh | undefined {
  return meshesInGroup(scene, group).find(
    (m) => (m.material as THREE.MeshStandardMaterial).color.getHexString() === hex,
  );
}
// Regression canary: finds any black BackSide inverted-hull outline mesh. The
// glb no longer bakes these (glTF can't round-trip THREE.BackSide), so this must
// always return [] — a non-empty result means the black-blob outline came back.
function outlineMeshes(scene: THREE.Scene, group: string): THREE.Mesh[] {
  return meshesInGroup(scene, group).filter((m) => {
    const mat = m.material as THREE.Material;
    return mat instanceof THREE.MeshBasicMaterial && mat.side === THREE.BackSide;
  });
}
function boundingSphereRadius(mesh: THREE.Mesh): number {
  mesh.geometry.computeBoundingSphere();
  return mesh.geometry.boundingSphere!.radius;
}

describe('glbExporter', () => {
  it('groups atoms under an "atoms" node plus a "bonds" node', () => {
    const scene = buildExportScene(structure, vis, style, elementData);
    expect(scene.getObjectByName('atoms')).toBeDefined();
    expect(scene.getObjectByName('bonds')).toBeDefined();
    expect(meshesInGroup(scene, 'atoms').length).toBeGreaterThan(0);
  });

  it('produces a binary glb (magic bytes glTF)', async () => {
    const scene = buildExportScene(structure, vis, style, elementData);
    const buf = await exportGlb(scene);
    expect(new TextDecoder().decode(new Uint8Array(buf, 0, 4))).toBe('glTF');
  });

  it('sizes sphere geometry to match the viewport radius formula', () => {
    const scene = buildExportScene(structure, vis, style, elementData);
    // O resolves to elementData color [1,0,0] -> ff0000; single O atom -> r 0.66
    const oMesh = meshByColor(scene, 'atoms', 'ff0000')!;
    expect(boundingSphereRadius(oMesh)).toBeCloseTo(0.66, 3);
  });

  it('applies preset element overrides (color + radiusScale)', () => {
    const styled = {
      elements: { O: { color: '#00ff00', radiusScale: 2 } },
      bondsStyle: style.bondsStyle,
      bondRadius: style.bondRadius,
    };
    const scene = buildExportScene(structure, vis, styled, elementData);
    const oMesh = meshByColor(scene, 'atoms', '00ff00')!;
    expect(oMesh).toBeDefined();
    expect(boundingSphereRadius(oMesh)).toBeCloseTo(1.32, 3);
  });

  it('applies a per-atom color override (selection) over the element color', () => {
    const scene = buildExportScene(structure, vis, style, elementData, {
      colorOverrides: { 0: '#123456' },
    });
    expect(meshByColor(scene, 'atoms', '123456')).toBeDefined();
  });

  it('applies a per-atom radius override (selection size)', () => {
    const scene = buildExportScene(structure, vis, style, elementData, {
      // shrink the O atom (index 0) to 0.5x
      radiusOverrides: { 0: 0.5 },
    });
    const oMesh = meshByColor(scene, 'atoms', 'ff0000')!;
    expect(boundingSphereRadius(oMesh)).toBeCloseTo(0.33, 3);
  });

  it('applies a per-atom opacity override (transparent material)', () => {
    const scene = buildExportScene(structure, vis, style, elementData, {
      opacityOverrides: { 0: 0.4 },
    });
    const oMesh = meshByColor(scene, 'atoms', 'ff0000')!;
    const mat = oMesh.material as THREE.MeshStandardMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.4, 5);
  });

  it('bakes renderStyle into material roughness (standard low, soft high)', () => {
    const stdMesh = meshByColor(
      buildExportScene(structure, vis, style, elementData, { renderStyle: 'standard' }),
      'atoms',
      'ff0000',
    )!;
    const softMesh = meshByColor(
      buildExportScene(structure, vis, style, elementData, { renderStyle: 'soft' }),
      'atoms',
      'ff0000',
    )!;
    expect((stdMesh.material as THREE.MeshStandardMaterial).roughness).toBeCloseTo(0.3, 5);
    expect((softMesh.material as THREE.MeshStandardMaterial).roughness).toBeCloseTo(1.0, 5);
  });

  it('bakes a nonzero emissive into cartoon materials (flat toon base survives without lights)', () => {
    const oMesh = meshByColor(
      buildExportScene(structure, vis, style, elementData, { renderStyle: 'cartoon' }),
      'atoms',
      'ff0000',
    )!;
    const mat = oMesh.material as THREE.MeshStandardMaterial;
    expect(mat.emissive.getHex()).not.toBe(0x000000);
  });

  it('keeps the emissive black for standard and soft', () => {
    for (const renderStyle of ['standard', 'soft'] as const) {
      const oMesh = meshByColor(
        buildExportScene(structure, vis, style, elementData, { renderStyle }),
        'atoms',
        'ff0000',
      )!;
      expect((oMesh.material as THREE.MeshStandardMaterial).emissive.getHex()).toBe(0x000000);
    }
  });

  it('bakes no outline mesh for any render style (glTF cannot round-trip BackSide)', () => {
    expect(
      outlineMeshes(buildExportScene(structure, vis, style, elementData, { renderStyle: 'standard' }), 'atoms').length,
    ).toBe(0);
    expect(
      outlineMeshes(buildExportScene(structure, vis, style, elementData, { renderStyle: 'cartoon' }), 'atoms').length,
    ).toBe(0);
    expect(
      outlineMeshes(buildExportScene(structure, vis, style, elementData, { renderStyle: 'soft' }), 'atoms').length,
    ).toBe(0);
  });

  it('no BackSide mesh anywhere in the scene for any style or opacity (round-trip regression guard)', () => {
    for (const renderStyle of ['standard', 'cartoon', 'soft'] as const) {
      for (const opacityOverrides of [{}, { 0: 0.3 }]) {
        const scene = buildExportScene(structure, vis, style, elementData, { renderStyle, opacityOverrides });
        scene.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (mat) {
            expect(mat.side).not.toBe(THREE.BackSide);
          }
        });
      }
    }
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
  bondsStyle: { style: 'cylinder' as const, colorMode: 'uniform' as const },
  bondRadius: 0.12,
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

function ringsBoundingBox(scene: THREE.Scene): THREE.Box3 {
  const rings = scene.getObjectByName('rings')!;
  const box = new THREE.Box3();
  rings.traverse((o) => {
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

  it('colors the ring by the nearest atom per-atom color override (mirrors AromaticRings.tsx)', () => {
    // ring center [0,0,0] is nearest to atom 0 (also at the origin).
    const scene = buildExportScene(cc, { bonds: [[0, 1, 1]], rings: [ring] }, uniformStyle, ccData, {
      colorOverrides: { 0: '#abcdef' },
    });
    expect(meshByColor(scene, 'rings', 'abcdef')).toBeDefined();
  });

  it('honors the render style on ring materials (roughness; no outline baked for any style)', () => {
    const ringScene = (renderStyle: 'standard' | 'soft' | 'cartoon') =>
      buildExportScene(cc, { bonds: [[0, 1, 1]], rings: [ring] }, uniformStyle, ccData, { renderStyle });
    const ringMat = (scene: THREE.Scene) =>
      meshesInGroup(scene, 'rings').find(
        (m) => (m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial,
      )!.material as THREE.MeshStandardMaterial;
    expect(ringMat(ringScene('standard')).roughness).toBeCloseTo(0.3, 5);
    expect(ringMat(ringScene('soft')).roughness).toBeCloseTo(1.0, 5);
    // No BackSide outline baked for any style — glTF cannot round-trip THREE.BackSide.
    expect(outlineMeshes(ringScene('standard'), 'rings').length).toBe(0);
    expect(outlineMeshes(ringScene('cartoon'), 'rings').length).toBe(0);
    expect(outlineMeshes(ringScene('soft'), 'rings').length).toBe(0);
  });

  it('scales the ring torus tube with the bond radius (Radius slider)', () => {
    const sceneWith = (bondRadius: number) =>
      buildExportScene(
        cc,
        { bonds: [[0, 1, 1]], rings: [ring] },
        { elements: {}, bondsStyle: uniformStyle.bondsStyle, bondRadius },
        ccData,
      );
    // The ring normal is +Z, so the torus lies in the XY plane and its z-extent
    // equals twice the (scaled) tube radius. Doubling the bond radius must
    // double the tube.
    const tubeZ = (scene: THREE.Scene) => {
      const b = ringsBoundingBox(scene);
      return b.max.z - b.min.z;
    };
    const thin = tubeZ(sceneWith(0.08));
    const thick = tubeZ(sceneWith(0.16));
    expect(thin).toBeGreaterThan(0);
    expect(thick).toBeCloseTo(2 * thin, 4);
  });
});

// --- Unit cell: "Show unit cell" must reach the glb (issue #4) ---------------
// The viewport draws the 3x3 cell as 12 edges (UnitCell.tsx). The glb export
// must emit those edges as thin cylinders (glTF cannot serialize THREE.Line),
// gated on the live `showUnitCell` view control.

describe('glbExporter unit cell', () => {
  const cell = [
    [3, 0, 0],
    [0, 3, 0],
    [0, 0, 3],
  ];

  it('exports a unitcell node when a cell is present and showUnitCell is on', () => {
    const scene = buildExportScene({ ...cc, cell }, { bonds: [[0, 1, 1]] }, uniformStyle, ccData, {
      showUnitCell: true,
    });
    const node = scene.getObjectByName('unitcell');
    expect(node).toBeDefined();
    // Edges are real meshes (cylinders), not THREE.Line, so they round-trip.
    let meshes = 0;
    node!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes += 1;
    });
    expect(meshes).toBeGreaterThan(0);
  });

  it('omits the unitcell node when showUnitCell is off', () => {
    const scene = buildExportScene({ ...cc, cell }, { bonds: [[0, 1, 1]] }, uniformStyle, ccData, {
      showUnitCell: false,
    });
    expect(scene.getObjectByName('unitcell')).toBeUndefined();
  });

  it('omits the unitcell node when there is no cell (non-periodic molecule)', () => {
    const scene = buildExportScene(cc, { bonds: [[0, 1, 1]] }, uniformStyle, ccData, {
      showUnitCell: true,
    });
    expect(scene.getObjectByName('unitcell')).toBeUndefined();
  });
});

describe('glbExporter robustness', () => {
  it('skips bonds whose atom positions are non-finite (mirrors the viewport guard)', () => {
    const broken = { symbols: ['C', 'C'], positions: [[0, 0, 0], [NaN, 0, 0]] };
    const scene = buildExportScene(broken, { bonds: [[0, 1, 1]] }, uniformStyle, ccData);
    expect(bondVertexCount(scene)).toBe(0);
  });
});

// --- Fidelity: bond color + opacity must match the viewport -----------------
// Bonds.tsx ALWAYS colors each half by its endpoint atom's per-atom color and
// resolves per-half opacity (resolveBondHalfOpacity). The glb export must too.

describe('glbExporter bond color/opacity fidelity', () => {
  const oh = { symbols: ['O', 'H'], positions: [[0, 0, 0], [0.96, 0, 0]] };
  const ohStyle = {
    elements: {},
    // colorMode uniform must be IGNORED — the viewport always element-splits.
    bondsStyle: { style: 'cylinder' as const, colorMode: 'uniform' as const },
    bondRadius: 0.12,
  };

  it('colors each bond half by its endpoint atom color, ignoring colorMode', () => {
    const scene = buildExportScene(oh, { bonds: [[0, 1, 1]] }, ohStyle, elementData);
    // O half -> ff0000, H half -> ffffff
    expect(meshByColor(scene, 'bonds', 'ff0000')).toBeDefined();
    expect(meshByColor(scene, 'bonds', 'ffffff')).toBeDefined();
  });

  it('uses the per-atom color override on the corresponding bond half', () => {
    const scene = buildExportScene(oh, { bonds: [[0, 1, 1]] }, ohStyle, elementData, {
      colorOverrides: { 0: '#123456' },
    });
    expect(meshByColor(scene, 'bonds', '123456')).toBeDefined();
  });

  it('applies a bond opacity override to both halves (transparent)', () => {
    const scene = buildExportScene(oh, { bonds: [[0, 1, 1]] }, ohStyle, elementData, {
      bondOpacityOverrides: { '0-1': 0.3 },
    });
    const halves = meshesInGroup(scene, 'bonds');
    expect(halves.length).toBeGreaterThan(0);
    for (const m of halves) {
      const mat = m.material as THREE.MeshStandardMaterial;
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBeCloseTo(0.3, 5);
    }
  });
});
