import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import radiiData from '../data/radii.json';
import { getAtomicNumber } from '../utils/chemistry';
import { getBondRadiusScale } from '../utils/bondUtils';
import { getNearestAtomIndexToRing } from '../components/r3f/aromaticRingsUtils';
import { resolveBondHalfOpacity, isOpacityTransparent } from '../components/r3f/materials/opacityPolicy';
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
 * `renderStyle` is baked into material roughness (standard 0.3 vs soft 1.0); the
 * cartoon/wireframe looks cannot round-trip to glb and fall back to solid meshes.
 *
 * Intentionally NOT exported (the glb captures the molecule's solid geometry, not
 * the full annotated scene): PBC-wrapped ghost bonds, hydrogen bonds (dashed), and
 * the unit cell. PNG export is a literal canvas snapshot and does keep all of
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
}

const bondIdFor = (i: number, j: number): string => `${Math.min(i, j)}-${Math.max(i, j)}`;

const roughnessForRenderStyle = (renderStyle: RenderStyle | undefined): number =>
    renderStyle === 'standard' ? 0.3 : 1.0;

type AtomStyleMap = { [symbol: string]: { color: string; radius: number } };

const SPHERE_SEGMENTS = 24;
const CYL_SEGMENTS = 16;
const TORUS_TUBULAR_SEGMENTS = 64;
const TORUS_RADIAL_SEGMENTS = 16;
const FALLBACK_RADII = 0.5;
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
    roughness: number,
): THREE.Object3D | null {
    if (buckets.size === 0) return null;
    const group = new THREE.Group();
    group.name = name;
    for (const { color, geoms } of buckets.values()) {
        const mesh = new THREE.Mesh(
            mergeGeometries(geoms),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color(...color),
                roughness,
                metalness: 0.0,
            }),
        );
        group.add(mesh);
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
    roughness: number,
): THREE.Object3D | null {
    if (buckets.size === 0) return null;
    const group = new THREE.Group();
    group.name = name;
    for (const { color, opacity, geoms } of buckets.values()) {
        const transparent = isOpacityTransparent(opacity);
        const mesh = new THREE.Mesh(
            mergeGeometries(geoms),
            new THREE.MeshStandardMaterial({
                color: new THREE.Color(...color),
                roughness,
                metalness: 0.0,
                transparent,
                opacity,
            }),
        );
        group.add(mesh);
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
    const roughness = roughnessForRenderStyle(overrides.renderStyle);

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
    const atomsGroup = mergeStyleBuckets(atomBuckets, 'atoms', roughness);
    if (atomsGroup) scene.add(atomsGroup);

    // --- Bonds: cylinders (1/2/3 per bond by order) under a single `bonds` node ---
    const bondsGroup = buildBonds(structure, vis, style, colorForAtom, opacityForAtom, overrides, roughness);
    if (bondsGroup) scene.add(bondsGroup);

    // --- Aromatic rings: a torus per ring under a single `rings` node ---
    const ringsGroup = buildRings(structure, vis, colorForAtom);
    if (ringsGroup) scene.add(ringsGroup);

    return scene;
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
    roughness: number,
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

    return mergeStyleBuckets(buckets, 'bonds', roughness);
}

/**
 * Build the aromatic-ring tori. Mirrors AromaticRings.tsx: a base
 * TorusGeometry(1.0, 0.1) scaled uniformly by `radius * 0.6`, oriented from +Z
 * to the ring normal, translated to the ring center, and colored by the atom
 * nearest the ring center.
 */
function buildRings(
    structure: MinimalStructure,
    vis: MinimalVis,
    colorForAtom: (i: number, sym: string) => [number, number, number],
): THREE.Object3D | null {
    const rings = vis.rings;
    if (!rings || rings.length === 0) return null;

    const defaultNormal = new THREE.Vector3(0, 0, 1);
    const positions: [number, number, number][] = structure.positions
        .filter((p) => p.length >= 3)
        .map((p) => [p[0], p[1], p[2]]);

    const { buckets, add } = colorBuckets();

    for (const [center, normal, radius] of rings) {
        if (center.length < 3 || normal.length < 3) continue;
        const s = radius * 0.6;
        const g = new THREE.TorusGeometry(1.0, 0.1, TORUS_RADIAL_SEGMENTS, TORUS_TUBULAR_SEGMENTS);
        g.scale(s, s, s);
        const ringNormal = new THREE.Vector3(normal[0], normal[1], normal[2]).normalize();
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(defaultNormal, ringNormal));
        g.translate(center[0], center[1], center[2]);

        const nearest = getNearestAtomIndexToRing([center[0], center[1], center[2]], positions);
        const color = nearest !== null ? colorForAtom(nearest, structure.symbols[nearest]) : FALLBACK_COLOR;
        add(color, g);
    }

    return mergeBuckets(buckets, 'rings', 0.45);
}

export async function exportGlb(scene: THREE.Scene): Promise<ArrayBuffer> {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(scene, { binary: true });
    return result as ArrayBuffer;
}
