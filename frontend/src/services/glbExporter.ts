import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import radiiData from '../data/radii.json';
import { getAtomicNumber } from '../utils/chemistry';
import type { ElementStyle, BondStyleSettings } from '../types/store';

/**
 * GLB exporter — produces a binary glTF whose geometry matches the live
 * viewport (src/components/r3f/Atoms.tsx + Bonds.tsx).
 *
 * Atom sizing: the viewer renders a base sphere of radius 0.5 scaled by
 * `radiiData[atomicNumber] * atomScale * 2`, so the effective on-screen radius
 * is `radiiData[atomicNumber] * atomScale` (times any per-element radiusScale).
 * `getElementData` bakes the `radiiData[atomicNumber] * atomScale` part so the
 * exported spheres line up with what the user sees.
 *
 * No lights are baked into the scene; the GLB carries MeshStandardMaterials and
 * relies on the viewer/PowerPoint environment to light it.
 */

interface ElementData {
    color: [number, number, number];
    radius: number;
}
interface MinimalStructure {
    symbols: string[];
    positions: number[][];
}
interface MinimalVis {
    bonds: [number, number, number][];
}
interface MinimalStyle {
    elements: Record<string, ElementStyle>;
    bondsStyle: BondStyleSettings;
}

type AtomStyleMap = { [symbol: string]: { color: string; radius: number } };

const SPHERE_SEGMENTS = 24;
const CYL_SEGMENTS = 16;
const FALLBACK_RADII = 0.5;
const FALLBACK_COLOR: [number, number, number] = [0.8, 0.4, 0.8];
const UNIFORM_BOND_COLOR: [number, number, number] = [0.55, 0.55, 0.55];

const radii = radiiData as number[];

function hexToRgb(hex: string): [number, number, number] {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
}

/**
 * Build per-element {color, radius} from the store's atomStyles (colors) and the
 * viewer's radii.json formula (`radii[atomicNumber] * atomScale`). This is the
 * helper the export menu (Task 16) calls to translate live store state into the
 * `elementData` argument of `buildExportScene`.
 */
export function getElementData(
    symbols: string[],
    atomStyles: AtomStyleMap | null,
    atomScale: number,
): Record<string, ElementData> {
    const out: Record<string, ElementData> = {};
    for (const sym of symbols) {
        if (out[sym]) continue;
        const atomicNumber = getAtomicNumber(sym);
        const baseRadius = (radii[atomicNumber] ?? FALLBACK_RADII) * atomScale;
        const hex = atomStyles?.[sym]?.color;
        out[sym] = {
            color: hex ? hexToRgb(hex) : FALLBACK_COLOR,
            radius: baseRadius,
        };
    }
    return out;
}

export function buildExportScene(
    structure: MinimalStructure,
    vis: MinimalVis,
    style: MinimalStyle,
    elementData: Record<string, ElementData>,
): THREE.Scene {
    const scene = new THREE.Scene();

    // --- Atoms: one merged mesh per element ---
    const bySymbol = new Map<string, number[]>();
    structure.symbols.forEach((s, i) => {
        if (!bySymbol.has(s)) bySymbol.set(s, []);
        bySymbol.get(s)!.push(i);
    });

    // Resolve the per-element color used by atoms AND split-color bond halves so
    // they stay consistent.
    const colorForSymbol = (sym: string): [number, number, number] => {
        const st = style.elements[sym] ?? {};
        if (st.color) return hexToRgb(st.color);
        return elementData[sym]?.color ?? FALLBACK_COLOR;
    };

    for (const [sym, indices] of bySymbol) {
        const st = style.elements[sym] ?? {};
        const base = elementData[sym] ?? { color: FALLBACK_COLOR, radius: FALLBACK_RADII };
        const radius = base.radius * (st.radiusScale ?? 1);
        const color = colorForSymbol(sym);
        const geoms = indices.map((i) => {
            const g = new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
            g.translate(structure.positions[i][0], structure.positions[i][1], structure.positions[i][2]);
            return g;
        });
        const opacity = st.opacity ?? 1;
        const mesh = new THREE.Mesh(
            mergeGeometries(geoms),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color(...color),
                roughness: 0.35,
                metalness: 0.0,
                transparent: opacity < 1,
                opacity,
            }),
        );
        mesh.name = `atoms-${sym}`;
        scene.add(mesh);
    }

    // --- Bonds: cylinders grouped under a single `bonds` node ---
    const bondsGroup = buildBonds(structure, vis, style, colorForSymbol);
    if (bondsGroup) scene.add(bondsGroup);

    return scene;
}

function buildBonds(
    structure: MinimalStructure,
    vis: MinimalVis,
    style: MinimalStyle,
    colorForSymbol: (sym: string) => [number, number, number],
): THREE.Object3D | null {
    const { radius, colorMode, uniformColor } = style.bondsStyle;
    const up = new THREE.Vector3(0, 1, 0);
    const splitColor = colorMode === 'element-split';

    // Group cylinder halves by the rgb color they should carry, so each color
    // becomes one merged mesh. For uniform mode there is a single group.
    const groups = new Map<string, { color: [number, number, number]; geoms: THREE.BufferGeometry[] }>();
    const pushHalf = (color: [number, number, number], geom: THREE.BufferGeometry) => {
        const key = color.join(',');
        let g = groups.get(key);
        if (!g) {
            g = { color, geoms: [] };
            groups.set(key, g);
        }
        g.geoms.push(geom);
    };

    const makeCyl = (center: THREE.Vector3, dir: THREE.Vector3, segLen: number): THREE.BufferGeometry => {
        const g = new THREE.CylinderGeometry(radius, radius, segLen, CYL_SEGMENTS);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
        g.translate(center.x, center.y, center.z);
        return g;
    };

    const uniform: [number, number, number] = uniformColor ? hexToRgb(uniformColor) : UNIFORM_BOND_COLOR;

    for (const [i, j] of vis.bonds) {
        const pi = structure.positions[i];
        const pj = structure.positions[j];
        if (!pi || !pj) continue;
        const a = new THREE.Vector3(pi[0], pi[1], pi[2]);
        const b = new THREE.Vector3(pj[0], pj[1], pj[2]);
        const dir = b.clone().sub(a);
        const len = dir.length();
        if (len < 1e-6) continue;

        if (splitColor) {
            const half = len / 2;
            // first half belongs to atom i, second to atom j
            pushHalf(colorForSymbol(structure.symbols[i]), makeCyl(a.clone().addScaledVector(dir, 0.25), dir, half));
            pushHalf(colorForSymbol(structure.symbols[j]), makeCyl(a.clone().addScaledVector(dir, 0.75), dir, half));
        } else {
            pushHalf(uniform, makeCyl(a.clone().addScaledVector(dir, 0.5), dir, len));
        }
    }

    if (groups.size === 0) return null;

    const group = new THREE.Group();
    group.name = 'bonds';
    for (const { color, geoms } of groups.values()) {
        const mesh = new THREE.Mesh(
            mergeGeometries(geoms),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color(...color),
                roughness: 0.45,
                metalness: 0.0,
            }),
        );
        group.add(mesh);
    }
    return group;
}

export async function exportGlb(scene: THREE.Scene): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(scene, { binary: true });
    return result as ArrayBuffer;
}
