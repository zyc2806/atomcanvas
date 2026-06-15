import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import radiiData from '../data/radii.json';
import { getAtomicNumber } from '../utils/chemistry';
import { getBondRadiusScale } from '../utils/bondUtils';
import { getNearestAtomIndexToRing } from '../components/r3f/aromaticRingsUtils';
import { resolveBondHalfOpacity, isOpacityTransparent } from '../components/r3f/materials/opacityPolicy';
import { ringTubeRadius } from '../utils/ringGeometry';
import type { ElementStyle, BondStyleSettings, RenderStyle } from '../types/store';

/**
 * GLB exporter — produces a binary glTF whose geometry matches the live
 * viewport (src/components/r3f/Atoms.tsx + Bonds.tsx + AromaticRings.tsx).
 *
 * Atom sizing: the viewer renders a base sphere of radius 0.5 scaled by
 * `radiiData[atomicNumber] * atomScale * 2`, so the effective on-screen radius
 * is `radiiData[atomicNumber] * atomScale` (times any per-element radiusScale).
 * `getElementData` bakes the `radiiData[atomicNumber] * atomScale` part so the
 * exported spheres line up with what the user sees.
 *
 * Bond orders and aromatic rings are reproduced too: a double bond becomes two
 * offset cylinders, a triple becomes three, and an aromatic ring becomes a torus
 * — mirroring Bonds.tsx (lines 220-237) and AromaticRings.tsx so a benzene
 * exported for PowerPoint keeps its double bonds and donuts.
 *
 * Live edits are honored via the optional `overrides` argument (see
 * `ExportOverrides`): per-atom color, size and opacity (selection edits), per-bond
 * opacity, and the render style. Atoms/bonds are bucketed by (color, opacity) so
 * per-atom styling survives the merge; each bond half is colored by its endpoint
 * atom (the viewport always element-splits, regardless of bondsStyle.colorMode).
 * `renderStyle` is baked per style (see materialForRenderStyle): standard =
 * glossy (roughness 0.3); soft = matte (roughness 1.0); cartoon = matte +
 * emissive base (so the flat toon body survives without scene lights).
 * No outline is baked into the GLB — glTF 2.0 has no back-face-only mode and
 * THREE.BackSide is silently dropped on export, causing the inflated hull to
 * occlude atoms in PowerPoint. The on-screen WebGL view and PNG export keep the
 * full outlined look; only the .glb omits it.
 * These are APPROXIMATIONS — the following live looks CANNOT round-trip to a
 * static glTF: soft shadows, screen-space AO, the cartoon 3-band toon banding,
 * the cartoon view-dependent white highlight, and the pixel-constant /
 * perspective-corrected outline width. Wireframe is not represented.
 *
 * The unit cell is exported (as 12 thin-cylinder edges under a `unitcell` node)
 * when the live `showUnitCell` view control is on and the structure carries a
 * cell. Intentionally NOT exported (the glb captures the molecule's solid
 * geometry, not the full annotated scene): PBC-wrapped ghost bonds and hydrogen
 * bonds (dashed). PNG export is a literal canvas snapshot and does keep all of
 * those. Note: glTF transparency (alphaMode BLEND) may not render in every
 * downstream viewer (e.g. PowerPoint's 3D model viewer).
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
    cell?: number[][];
}
interface MinimalVis {
    bonds: [number, number, number][];
    rings?: [number[], number[], number][];
}
interface MinimalStyle {
    elements: Record<string, ElementStyle>;
    bondsStyle: BondStyleSettings;
}

/**
 * Per-atom / per-bond style overrides that mirror the live viewport. Atom maps
 * are keyed by atom index (the values already win over element styling, exactly
 * like ViewerCanvas's merged overrides). `bondOpacityOverrides` is keyed by the
 * "min-max" bond id. `renderStyle` is baked into material roughness.
 */
export interface ExportOverrides {
    colorOverrides?: { [i: number]: string };
    opacityOverrides?: { [i: number]: number };
    radiusOverrides?: { [i: number]: number };
    bondOpacityOverrides?: { [bondId: string]: number };
    renderStyle?: RenderStyle;
    // Mirrors the live `showUnitCell` view control. When true (and a cell is
    // present) the 3x3 cell is exported as 12 thin-cylinder edges.
    showUnitCell?: boolean;
}

const bondIdFor = (i: number, j: number): string => `${Math.min(i, j)}-${Math.max(i, j)}`;

/** Per-render-style material recipe baked into the glb (issue #7). */
interface RenderStyleMaterial {
    roughness: number;
    /** Base color is multiplied by this and baked into `emissive` (0 = none). */
    emissiveFactor: number;
}

/**
 * Translate the live render style into a baked material recipe. The live looks
 * cannot fully round-trip to glTF, so each style is approximated:
 *  - standard: glossy (low roughness)
 *  - cartoon : flat (high roughness) + emissive base (so the toon body survives
 *              without scene lights)
 *  - soft    : flat, matte (lit by the environment)
 * No outline is baked — glTF 2.0 has no back-face-only mode and THREE.BackSide
 * is silently dropped on export, causing the hull to occlude atoms downstream
 * (e.g. PowerPoint). The on-screen WebGL view keeps outlines; the .glb does not.
 * An undefined style (direct callers / older tests) is treated as plain matte,
 * preserving the previous default.
 */
function materialForRenderStyle(renderStyle: RenderStyle | undefined): RenderStyleMaterial {
    switch (renderStyle) {
        case 'standard':
            return { roughness: 0.3, emissiveFactor: 0 };
        case 'cartoon':
            return { roughness: 1.0, emissiveFactor: 0.3 };
        case 'soft':
            return { roughness: 1.0, emissiveFactor: 0 };
        default:
            return { roughness: 1.0, emissiveFactor: 0 };
    }
}

/** MeshStandardMaterial for a bucket, baking the render-style roughness/emissive
 * (and optional transparency). */
function bucketMaterial(
    color: [number, number, number],
    mat: RenderStyleMaterial,
    opacity?: number,
): THREE.MeshStandardMaterial {
    const c = new THREE.Color(...color);
    const params: THREE.MeshStandardMaterialParameters = {
        color: c,
        roughness: mat.roughness,
        metalness: 0.0,
    };
    if (mat.emissiveFactor > 0) {
        params.emissive = c.clone().multiplyScalar(mat.emissiveFactor);
    }
    if (opacity !== undefined) {
        params.transparent = isOpacityTransparent(opacity);
        params.opacity = opacity;
    }
    return new THREE.MeshStandardMaterial(params);
}

type AtomStyleMap = { [symbol: string]: { color: string; radius: number } };

const SPHERE_SEGMENTS = 24;
const CYL_SEGMENTS = 16;
const TORUS_TUBULAR_SEGMENTS = 64;
const TORUS_RADIAL_SEGMENTS = 16;
const FALLBACK_RADII = 0.5;
// Unit-cell edges are drawn as thin black cylinders (glTF cannot serialize
// THREE.Line, and WebGL ignores Line `linewidth`).
const UNIT_CELL_EDGE_RADIUS = 0.02;
const UNIT_CELL_COLOR: [number, number, number] = [0, 0, 0];
// Unknown-element fallback. Matches the viewport's getAtomBaseColor fallback
// (#ff1493) in src/hooks/useAtomColors.ts so an exotic symbol exports the same
// color it renders on screen.
const FALLBACK_COLOR: [number, number, number] = [1, 20 / 255, 147 / 255];

const radii = radiiData as number[];

function hexToRgb(hex: string): [number, number, number] {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
}

/** Accumulate geometries into per-color buckets, then merge each bucket into one
 * mesh. Atoms, bond halves, and rings all follow this one-mesh-per-color pattern
 * so the glb stays light (a handful of draw calls regardless of atom count). */
function colorBuckets() {
    const buckets = new Map<string, { color: [number, number, number]; geoms: THREE.BufferGeometry[] }>();
    const add = (color: [number, number, number], geom: THREE.BufferGeometry) => {
        const key = color.join(',');
        let g = buckets.get(key);
        if (!g) {
            g = { color, geoms: [] };
            buckets.set(key, g);
        }
        g.geoms.push(geom);
    };
    return { buckets, add };
}

function mergeBuckets(
    buckets: Map<string, { color: [number, number, number]; geoms: THREE.BufferGeometry[] }>,
    name: string,
    mat: RenderStyleMaterial,
): THREE.Object3D | null {
    if (buckets.size === 0) return null;
    const group = new THREE.Group();
    group.name = name;
    for (const { color, geoms } of buckets.values()) {
        const merged = mergeGeometries(geoms);
        group.add(new THREE.Mesh(merged, bucketMaterial(color, mat)));
    }
    return group;
}

interface StyleBucket {
    color: [number, number, number];
    opacity: number;
    geoms: THREE.BufferGeometry[];
}

/** Like colorBuckets but also keyed by opacity, so per-atom / per-bond opacity
 * survives the one-mesh-per-bucket merge (each distinct color+opacity becomes one
 * transparent-or-opaque mesh). */
function styleBuckets() {
    const buckets = new Map<string, StyleBucket>();
    const add = (color: [number, number, number], opacity: number, geom: THREE.BufferGeometry) => {
        const key = `${color.join(',')}|${opacity.toFixed(4)}`;
        let g = buckets.get(key);
        if (!g) {
            g = { color, opacity, geoms: [] };
            buckets.set(key, g);
        }
        g.geoms.push(geom);
    };
    return { buckets, add };
}

function mergeStyleBuckets(
    buckets: Map<string, StyleBucket>,
    name: string,
    mat: RenderStyleMaterial,
): THREE.Object3D | null {
    if (buckets.size === 0) return null;
    const group = new THREE.Group();
    group.name = name;
    for (const { color, opacity, geoms } of buckets.values()) {
        const merged = mergeGeometries(geoms);
        group.add(new THREE.Mesh(merged, bucketMaterial(color, mat, opacity)));
    }
    return group;
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
    overrides: ExportOverrides = {},
): THREE.Scene {
    const scene = new THREE.Scene();
    const mat = materialForRenderStyle(overrides.renderStyle);

    // Per-atom style resolvers mirroring the live viewport (Atoms.tsx): a
    // per-atom override (selection color/size/opacity) wins, otherwise the
    // element-level style applies. Element color also drives split-color bond
    // halves so atoms and bonds stay consistent.
    const colorForSymbol = (sym: string): [number, number, number] => {
        const st = style.elements[sym] ?? {};
        if (st.color) return hexToRgb(st.color);
        return elementData[sym]?.color ?? FALLBACK_COLOR;
    };
    const colorForAtom = (i: number, sym: string): [number, number, number] => {
        const c = overrides.colorOverrides?.[i];
        return c !== undefined ? hexToRgb(c) : colorForSymbol(sym);
    };
    const opacityForAtom = (i: number, sym: string): number => {
        const o = overrides.opacityOverrides?.[i];
        return o !== undefined ? o : (style.elements[sym]?.opacity ?? 1);
    };
    const radiusForAtom = (i: number, sym: string): number => {
        const base = elementData[sym]?.radius ?? FALLBACK_RADII;
        const scale = overrides.radiusOverrides?.[i] ?? style.elements[sym]?.radiusScale ?? 1;
        return base * scale;
    };

    // --- Atoms: merged meshes bucketed by (color, opacity) so per-atom styles
    //     survive the merge while the glb stays light. ---
    const { buckets: atomBuckets, add: addAtom } = styleBuckets();
    structure.symbols.forEach((sym, i) => {
        const radius = radiusForAtom(i, sym);
        const g = new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
        g.translate(structure.positions[i][0], structure.positions[i][1], structure.positions[i][2]);
        addAtom(colorForAtom(i, sym), opacityForAtom(i, sym), g);
    });
    const atomsGroup = mergeStyleBuckets(atomBuckets, 'atoms', mat);
    if (atomsGroup) scene.add(atomsGroup);

    // --- Bonds: cylinders (1/2/3 per bond by order) under a single `bonds` node ---
    const bondsGroup = buildBonds(structure, vis, style, colorForAtom, opacityForAtom, overrides, mat);
    if (bondsGroup) scene.add(bondsGroup);

    // --- Aromatic rings: a torus per ring under a single `rings` node ---
    const ringsGroup = buildRings(structure, vis, colorForAtom, style.bondsStyle.radius, mat);
    if (ringsGroup) scene.add(ringsGroup);

    // --- Unit cell: 12 edge cylinders under a `unitcell` node, gated on the
    //     live showUnitCell view control (only when a cell is present) ---
    if (overrides.showUnitCell) {
        const cellGroup = buildUnitCell(structure.cell);
        if (cellGroup) scene.add(cellGroup);
    }

    return scene;
}

/**
 * Build the unit-cell wireframe as 12 thin black cylinder edges. Mirrors the
 * vertex layout of UnitCell.tsx but emits cylinders rather than a THREE.Line so
 * the edges survive the glTF export (and have visible width, unlike Line
 * `linewidth`). Returns null for a missing/degenerate cell.
 */
function buildUnitCell(cell: number[][] | undefined): THREE.Object3D | null {
    if (!cell || !Array.isArray(cell) || cell.length !== 3) return null;
    if (!cell.every((row) => Array.isArray(row) && row.length >= 3 && row.every(Number.isFinite))) {
        return null;
    }

    const origin = new THREE.Vector3(0, 0, 0);
    const a = new THREE.Vector3(cell[0][0], cell[0][1], cell[0][2]);
    const b = new THREE.Vector3(cell[1][0], cell[1][1], cell[1][2]);
    const c = new THREE.Vector3(cell[2][0], cell[2][1], cell[2][2]);
    const v000 = origin.clone();
    const v100 = a.clone();
    const v010 = b.clone();
    const v001 = c.clone();
    const v110 = a.clone().add(b);
    const v101 = a.clone().add(c);
    const v011 = b.clone().add(c);
    const v111 = a.clone().add(b).add(c);
    const edges: [THREE.Vector3, THREE.Vector3][] = [
        [v000, v100], [v000, v010], [v000, v001],
        [v100, v110], [v100, v101],
        [v010, v110], [v010, v011],
        [v001, v101], [v001, v011],
        [v110, v111], [v101, v111], [v011, v111],
    ];

    const cylAxis = new THREE.Vector3(0, 1, 0);
    const geoms: THREE.BufferGeometry[] = [];
    for (const [p, q] of edges) {
        const dir = q.clone().sub(p);
        const len = dir.length();
        if (len < 1e-6) continue;
        const g = new THREE.CylinderGeometry(UNIT_CELL_EDGE_RADIUS, UNIT_CELL_EDGE_RADIUS, len, CYL_SEGMENTS);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(cylAxis, dir.clone().normalize()));
        const mid = p.clone().add(q).multiplyScalar(0.5);
        g.translate(mid.x, mid.y, mid.z);
        geoms.push(g);
    }
    if (geoms.length === 0) return null;

    const group = new THREE.Group();
    group.name = 'unitcell';
    group.add(
        new THREE.Mesh(
            mergeGeometries(geoms),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color(...UNIT_CELL_COLOR),
                roughness: 1.0,
                metalness: 0.0,
            }),
        ),
    );
    return group;
}

/**
 * Orient a multi-order bond: returns the in-plane `right` axis the offset
 * cylinders are pushed along (and a perpendicular `up` used for the triple
 * bond's third cylinder). Mirrors Bonds.tsx `calculateBondRightVector`: when the
 * bond sits in a ring/conjugated system the double bond lies in that plane;
 * otherwise it falls back to a stable world-axis cross product.
 */
function computeBondAxes(
    bondDir: THREE.Vector3,
    idx1: number,
    idx2: number,
    positions: number[][],
    adjacency: Map<number, number[]>,
    order: number,
): { right: THREE.Vector3; up: THREE.Vector3 } {
    const worldUp = new THREE.Vector3(0, 1, 0);
    const worldRight = new THREE.Vector3(1, 0, 0);
    const planeNormal = new THREE.Vector3();
    let neighborCount = 0;

    if (order > 1) {
        const accumulate = (centerIdx: number, otherIdx: number) => {
            const center = positions[centerIdx];
            const neighbors = adjacency.get(centerIdx);
            if (!center || !neighbors) return;
            const c = new THREE.Vector3(center[0], center[1], center[2]);
            for (const nIdx of neighbors) {
                if (nIdx === otherIdx) continue;
                const np = positions[nIdx];
                if (!np) continue;
                const v = new THREE.Vector3(np[0], np[1], np[2]).sub(c).normalize();
                const n = new THREE.Vector3().crossVectors(v, bondDir);
                // Prevent symmetric cancellation across the two ring sides.
                if (planeNormal.dot(n) < 0) n.negate();
                planeNormal.add(n);
                neighborCount++;
            }
        };
        accumulate(idx1, idx2);
        accumulate(idx2, idx1);
    }

    const right = new THREE.Vector3();
    if (neighborCount > 0 && planeNormal.lengthSq() > 0.001) {
        planeNormal.normalize();
        right.crossVectors(planeNormal, bondDir).normalize();
    } else {
        right.crossVectors(bondDir, worldUp).normalize();
        if (right.lengthSq() < 0.001) right.crossVectors(bondDir, worldRight).normalize();
    }
    const up = new THREE.Vector3().crossVectors(right, bondDir).normalize();
    return { right, up };
}

function buildBonds(
    structure: MinimalStructure,
    vis: MinimalVis,
    style: MinimalStyle,
    colorForAtom: (i: number, sym: string) => [number, number, number],
    opacityForAtom: (i: number, sym: string) => number,
    overrides: ExportOverrides,
    mat: RenderStyleMaterial,
): THREE.Object3D | null {
    const { radius } = style.bondsStyle;
    const cylAxis = new THREE.Vector3(0, 1, 0);
    const { symbols, positions } = structure;
    const bondOpacityOverrides = overrides.bondOpacityOverrides;

    // Adjacency (over bond endpoints) lets computeBondAxes orient double/triple
    // bonds into their ring plane, exactly like the live renderer.
    const adjacency = new Map<number, number[]>();
    const link = (a: number, b: number) => {
        let arr = adjacency.get(a);
        if (!arr) {
            arr = [];
            adjacency.set(a, arr);
        }
        arr.push(b);
    };
    for (const [i, j] of vis.bonds) {
        link(i, j);
        link(j, i);
    }

    const { buckets, add } = styleBuckets();

    const makeCyl = (
        center: THREE.Vector3,
        dir: THREE.Vector3,
        segLen: number,
        cylRadius: number,
    ): THREE.BufferGeometry => {
        const g = new THREE.CylinderGeometry(cylRadius, cylRadius, segLen, CYL_SEGMENTS);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(cylAxis, dir.clone().normalize()));
        g.translate(center.x, center.y, center.z);
        return g;
    };

    for (const bond of vis.bonds) {
        const i = bond[0];
        const j = bond[1];
        const order = bond[2] ?? 1;
        const pi = positions[i];
        const pj = positions[j];
        // Mirror the viewport's isRenderableRegularBond guard: drop bonds with
        // a missing endpoint, a self-loop, or any non-finite coordinate so we
        // never emit NaN geometry into the glb.
        if (!pi || !pj || i === j) continue;
        if (![...pi, ...pj].every(Number.isFinite)) continue;
        const a = new THREE.Vector3(pi[0], pi[1], pi[2]);
        const b = new THREE.Vector3(pj[0], pj[1], pj[2]);
        const dir = b.clone().sub(a);
        const len = dir.length();
        if (len < 1e-6) continue;
        const dirN = dir.clone().normalize();

        const radiusScale = getBondRadiusScale(symbols[i], symbols[j]);
        // Match Bonds.tsx: multi-order cylinders are thinned to 0.6× so the pair
        // / triple reads as a bond rather than a fat tube.
        const cylRadius = radius * radiusScale * (order >= 2 ? 0.6 : 1);

        const { right, up } = computeBondAxes(dirN, i, j, positions, adjacency, order);

        const offsets: THREE.Vector3[] = [];
        if (order === 2) {
            const d = radius * radiusScale * 1.2;
            offsets.push(right.clone().multiplyScalar(d), right.clone().multiplyScalar(-d));
        } else if (order === 3) {
            const d = radius * radiusScale * 1.4;
            for (const ang of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
                offsets.push(
                    right.clone().multiplyScalar(Math.cos(ang))
                        .add(up.clone().multiplyScalar(Math.sin(ang)))
                        .multiplyScalar(d),
                );
            }
        } else {
            offsets.push(new THREE.Vector3(0, 0, 0));
        }

        // The viewport always element-splits a bond: each half is colored by its
        // endpoint atom's (possibly overridden) color, and its opacity follows
        // the endpoint atom unless a per-bond opacity override is set.
        const bondId = bondIdFor(i, j);
        const bondOverride = bondOpacityOverrides?.[bondId];
        const colorI = colorForAtom(i, symbols[i]);
        const colorJ = colorForAtom(j, symbols[j]);
        const opacityI = resolveBondHalfOpacity(opacityForAtom(i, symbols[i]), bondOverride);
        const opacityJ = resolveBondHalfOpacity(opacityForAtom(j, symbols[j]), bondOverride);

        for (const off of offsets) {
            const sa = a.clone().add(off);
            const half = len / 2;
            // first half belongs to atom i, second to atom j
            add(colorI, opacityI, makeCyl(sa.clone().addScaledVector(dirN, len * 0.25), dirN, half, cylRadius));
            add(colorJ, opacityJ, makeCyl(sa.clone().addScaledVector(dirN, len * 0.75), dirN, half, cylRadius));
        }
    }

    return mergeStyleBuckets(buckets, 'bonds', mat);
}

/**
 * Build the aromatic-ring tori. Mirrors AromaticRings.tsx: a base
 * TorusGeometry(1.0, tube) scaled uniformly by `radius * 0.6`, oriented from +Z
 * to the ring normal, translated to the ring center, and colored by the atom
 * nearest the ring center. The tube radius follows the bond radius via the shared
 * `ringTubeRadius` helper so the donut thickens with the Radius slider, exactly
 * like the bonds (and like the viewport).
 */
function buildRings(
    structure: MinimalStructure,
    vis: MinimalVis,
    colorForAtom: (i: number, sym: string) => [number, number, number],
    bondRadius: number,
    mat: RenderStyleMaterial,
): THREE.Object3D | null {
    const rings = vis.rings;
    if (!rings || rings.length === 0) return null;

    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const tube = ringTubeRadius(bondRadius);
    const positions: [number, number, number][] = structure.positions
        .filter((p) => p.length >= 3)
        .map((p) => [p[0], p[1], p[2]]);

    const { buckets, add } = colorBuckets();

    for (const [center, normal, radius] of rings) {
        if (center.length < 3 || normal.length < 3) continue;
        const s = radius * 0.6;
        const g = new THREE.TorusGeometry(1.0, tube, TORUS_RADIAL_SEGMENTS, TORUS_TUBULAR_SEGMENTS);
        g.scale(s, s, s);
        const ringNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(defaultNormal, ringNormal));
        g.translate(center[0], center[1], center[2]);

        const nearest = getNearestAtomIndexToRing([center[0], center[1], center[2]], positions);
        const color = nearest !== null ? colorForAtom(nearest, structure.symbols[nearest]) : FALLBACK_COLOR;
        add(color, g);
    }

    return mergeBuckets(buckets, 'rings', mat);
}

export async function exportGlb(scene: THREE.Scene): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(scene, { binary: true });
    return result as ArrayBuffer;
}
