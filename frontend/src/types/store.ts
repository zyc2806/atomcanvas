export type SelectionMode = 'single' | 'slab' | 'disabled';

export type DisplayMode = 'ball-stick' | 'vdw' | 'wireframe';

export type RenderStyle = 'soft' | 'cartoon' | 'standard';

export type AppThemeMode = 'dark' | 'light';

export type BondID = string; // "${min}-${max}" or "ghost:${idx}:${x}_${y}_${z}"

export type BondInferenceMode = 'auto' | 'quick' | 'full';

export interface BondDiagnostics {
    mode: BondInferenceMode;
    cluster_strategies: string[];
    summary: Record<string, number>;
}

export interface StyleProperty<T> {
    value: T;
    timestamp: number;
}

export type AtomSelectorConfig =
    | { type: 'manual'; indices: number[] }
    | { type: 'element'; symbol: string }
    | { type: 'range'; from: number; to: number }
    | { type: 'all' };

export type BondSelectorConfig =
    | { type: 'bond_type'; pair: [string, string] }
    | { type: 'all' };

export type SelectorConfig = AtomSelectorConfig | BondSelectorConfig;

export interface StyleBlock {
    id: string;
    name: string;
    enabled: boolean;
    target: 'atoms' | 'bonds';
    selector: {
        config: SelectorConfig;
        cacheKey?: string;
    };
    style: {
        color?: StyleProperty<string>;
        opacity?: StyleProperty<number>;
        scale?: StyleProperty<number>;
        radius?: StyleProperty<number>;
        visible?: StyleProperty<boolean>;
    };
}

export interface CartoonParams {
    outlineThickness: number;
    highlightThreshold: number;
    shadowThreshold: number;
    shadowBrightness: number;
}

export interface Structure {
    symbols: string[];
    positions: [number, number, number][];
    wrapped_positions: [number, number, number][];
    cell?: number[][];
    pbc?: [boolean, boolean, boolean];
}

export interface Visualization {
    bonds: [number, number, number][];
    rings?: [number[], number[], number][];
    wrapped_ghost_bonds: [[number, number, number], [number, number, number], number, number, number][];
    h_bond_geometries: [number[], number[]][];
    unwrapped_h_bonds: [number[], number[]][];
    labels?: string[];
    fixed_atoms?: number[];
    bond_diagnostics?: BondDiagnostics;
}

export interface StandardStructureObject {
    structure: Structure;
    visualization: Visualization;
    trajectory?: Structure[];
}

export interface ViewControls {
    showBonds: boolean;
    showHBonds: boolean;
    showUnitCell: boolean;
    tooltipTheme: 'dark' | 'light';
    showLabels: boolean;
    enableSelection: boolean;
    showOutline: boolean;
    showShadows: boolean;
    showAxesGizmo?: boolean;
    forceTransparentBackground?: boolean;
    axesLabels: 'xyz' | 'abc';
}

export interface VisualizationParams {
    displayMode: DisplayMode;
    bondThreshold: number;
    bondRadius: number;
    bondInferenceMode?: BondInferenceMode;
    includeBondDiagnostics?: boolean;
    atomScale: number;
    showHBonds: boolean;
    hBondMaxDist: number;
    hBondMinAngle: number;
    hBondColor: string;
    hBondDashSize: number;
    hBondGapSize: number;
    renderStyle: RenderStyle;
    cartoonParams: CartoonParams;
    bond_overrides?: { [key: string]: string };
}

export interface CameraViewTrigger {
    position: [number, number, number];
    target: [number, number, number];
    timestamp: number;
    preserveDistance?: boolean;
    up?: [number, number, number];
}

// Slice Interfaces
export interface DataSlice {
    structureData: StandardStructureObject | null;
    loading: boolean;
    error: string | null;
    setStructureData: (data: StandardStructureObject) => void;
    setLoading: (isLoading: boolean, expectedTabId?: string | null) => void;
    setError: (errorMessage: string | null, expectedTabId?: string | null) => void;
    clearStructure: () => void;
    updateStructure: (newStructure: Structure | StandardStructureObject, expectedTabId?: string | null) => void;
}

export interface UISlice {
    appThemeMode: AppThemeMode;
    setAppThemeMode: (mode: AppThemeMode) => void;
    toggleAppThemeMode: () => void;

    viewControls: ViewControls;
    visParams: VisualizationParams;
    selectedAtoms: number[];
    selectedBonds: string[];
    adjacencyMap: Map<number, Set<string>>;
    rebuildAdjacencyMap: (structure: Structure, visualization: Visualization) => void;
    cameraState: CameraState | null;
    colorOverrides: { [index: number]: string } | null;
    opacityOverrides: { [index: number]: number } | null;
    radiusOverrides: { [index: number]: number } | null;
    perAtomColorOverrides: { [index: number]: string } | null;
    perAtomOpacityOverrides: { [index: number]: number } | null;
    applySelectionColor: (indices: number[], color: string) => void;
    applySelectionSize: (indices: number[], scale: number) => void;
    toggleSelectionHidden: (indices: number[]) => void;
    bondOverrides: { [key: string]: string } | null;
    bondOpacityOverrides: { [key: string]: number } | null;
    selectionMode: SelectionMode;
    selectionExpression: string;
    clusterIndices: number[] | null;
    slabTarget: number | null;
    cameraViewTrigger: CameraViewTrigger | null;
    viewTarget: [number, number, number] | null;
    userHasInteracted: boolean;
    cameraType: 'perspective' | 'orthographic';
    cameraApplyRevision: number;
    notification: { message: string; severity: 'success' | 'info' | 'error'; key: number } | null;
    notify: (message: string, severity?: 'success' | 'info' | 'error') => void;
    clearNotification: () => void;

    setViewControls: (controls: Partial<ViewControls>) => void;
    setVisParams: (params: Partial<VisualizationParams>) => void;
    setDisplayMode: (mode: DisplayMode) => void;
    setUserHasInteracted: (hasInteracted: boolean) => void;
    setViewTarget: (target: [number, number, number]) => void;
    applyCameraSnapshot: (snapshot: CameraSnapshot) => void;

    setShowHBonds: (show: boolean) => void;
    setHBondMaxDist: (dist: number) => void;
    setHBondMinAngle: (angle: number) => void;
    setBondThreshold: (threshold: number) => void;
    setCameraType: (type: 'perspective' | 'orthographic') => void;

    setCameraState: (cameraState: CameraState | null) => void;
    setColorOverrides: (overrides: { [index: number]: string } | null) => void;
    setOpacityOverrides: (overrides: { [index: number]: number } | null) => void;
    setRadiusOverrides: (overrides: { [index: number]: number } | null) => void;
    setBondOverride: (bondId: string, color: string | null) => void;
    setMultipleBondOverrides: (overrides: { [key: string]: string | null }) => void;
    clearBondOverrides: () => void;

    setBondOpacityOverride: (bondId: string, opacity: number | null) => void;
    setMultipleBondOpacityOverrides: (overrides: { [key: string]: number | null }) => void;
    clearBondOpacityOverrides: () => void;

    toggleSelection: (index: number) => void;
    toggleBondSelection: (bondId: string) => void;
    clearSelection: () => void;
    updateSelection: (indices: number[], operation: 'replace' | 'add' | 'filter') => void;

    setSelectionMode: (mode: SelectionMode) => void;
    setSelectionExpression: (expression: string) => void;
    setClusterIndices: (indices: number[] | null) => void;
    setSlabTarget: (id: number | null) => void;
    triggerCameraView: (position: [number, number, number], target?: [number, number, number], preserveDistance?: boolean, up?: [number, number, number]) => void;

    atomStyles: { [symbol: string]: { color: string; radius: number } } | null;
    setAtomStyles: (styles: { [symbol: string]: { color: string; radius: number } } | null) => void;

    updateVisualization: () => Promise<void>;
    resetUIState: () => void;
    resetSlabState: () => void;
}

export interface CameraState {
    position: [number, number, number];
    up?: [number, number, number];
    zoom: number;
}

export interface CameraSnapshot {
    type: 'perspective' | 'orthographic';
    target: [number, number, number];
    state: CameraState;
}

export interface HistorySnapshot {
    structure: StandardStructureObject;
    selectedAtoms: number[];
    selectedBonds: string[];
    selectionExpression: string;
    bondOverrides: { [key: string]: string } | null;
    bondOpacityOverrides: { [key: string]: number } | null;
    visParams: VisualizationParams;
    viewControls: ViewControls;
    cameraState: CameraState | null;
    clusterIndices: number[] | null;
    slabTarget: number | null;
    colorOverrides: { [index: number]: string } | null;
    opacityOverrides: { [index: number]: number } | null;
    radiusOverrides: { [index: number]: number } | null;
    perAtomColorOverrides: { [index: number]: string } | null;
    perAtomOpacityOverrides: { [index: number]: number } | null;
    atomStyles: { [symbol: string]: { color: string; radius: number } } | null;
    topologyOverrides: Record<string, string>;
}

export interface HistorySlice {
    past: HistorySnapshot[];
    future: HistorySnapshot[];
    undo: () => void;
    redo: () => void;
    pushHistory: (snapshot?: Partial<HistorySnapshot>) => void;
}

export interface StyleSlice {
    styleBlocks: StyleBlock[];
    activeBlockId: string | null;

    addBlock: (block: Omit<StyleBlock, 'id'>) => string;
    removeBlock: (id: string) => void;
    updateBlockProperty: <K extends keyof StyleBlock['style']>(
        blockId: string,
        property: K,
        value: StyleBlock['style'][K] extends StyleProperty<infer T> | undefined ? T : never
    ) => void;
    setActiveBlock: (id: string | null) => void;
    toggleBlock: (id: string) => void;
    reorderBlocks: (sourceIndex: number, destIndex: number) => void;
    updateBlockSelector: (blockId: string, config: SelectorConfig) => void;
}

// Scene slice types (inlined here so the type layer is self-contained; the
// createSceneSlice implementation re-uses these in Task 6).
export type BackgroundType = 'solid';
export type LightingPreset = 'studio' | 'flat' | 'dramatic' | 'custom';

export interface LightConfig {
    enabled: boolean;
    intensity: number;
    color: string;
    position: [number, number, number];
}

export interface BackgroundConfig {
    type: BackgroundType;
    solidColor: string;
}

export interface SceneSettings {
    background: BackgroundConfig;
    globalBrightness: number; // 0.0 - 2.0, default 1.0
    ambientLight: LightConfig;
    keyLight: LightConfig;
    fillLight: LightConfig;
    rimLight: LightConfig;
    lightingPreset: LightingPreset;
    showLightGizmos: boolean;
}

export interface SceneSlice {
    sceneSettings: SceneSettings;
    backgroundUserCustomized: boolean;

    setBackground: (config: Partial<BackgroundConfig>) => void;
    setBackgroundAuto: (config: Partial<BackgroundConfig>) => void;
    setGlobalBrightness: (brightness: number) => void;
    setLight: (lightName: 'ambientLight' | 'keyLight' | 'fillLight' | 'rimLight', config: Partial<LightConfig>) => void;
    setLightingPreset: (preset: LightingPreset) => void;
    toggleLightGizmos: () => void;
    resetSceneSettings: () => void;
}

// Style-preset slice types (Task 7). Added here in Task 6 (decision D6) so that
// createUISlice/createDataSlice's `activeTabId` reference typechecks against the
// composite StructureState before the slices themselves are implemented.
export interface ElementStyle { color?: string; radiusScale?: number; opacity?: number }

export interface BondStyleSettings {
    style: 'cylinder';
    radius: number;
    colorMode: 'element-split' | 'uniform';
    uniformColor?: string;
}

export interface StylePresetState {
    presetName: string;
    elements: Record<string, ElementStyle>;
    bondsStyle: BondStyleSettings;
}

export interface PresetSlice extends StylePresetState {
    setElementStyle: (symbol: string, style: ElementStyle) => void;
    clearElementStyle: (symbol: string) => void;
    setBondsStyle: (s: Partial<BondStyleSettings>) => void;
    setPresetName: (name: string) => void;
    replacePreset: (p: StylePresetState) => void;
}

export interface StructureTab {
    id: string;
    name: string;
    doc: StandardStructureObject;
    bondOverrides: Record<string, string>;   // "i-j" -> "delete" | "1.0" | "2.0" | ...
    colorOverrides: { [index: number]: string } | null;
    opacityOverrides: { [index: number]: number } | null;
    radiusOverrides: { [index: number]: number } | null;
    perAtomColorOverrides: { [index: number]: string } | null;
    perAtomOpacityOverrides: { [index: number]: number } | null;
    camera: CameraSnapshot | null;
}

export interface TabsSlice {
    tabs: StructureTab[];
    activeTabId: string | null;
    topologyOverrides: Record<string, string>;  // overrides of the ACTIVE structure
    addTab: (doc: StandardStructureObject, name: string) => string;
    switchTab: (id: string) => void;
    closeTab: (id: string) => void;
    renameTab: (id: string, name: string) => void;
    setTopologyOverride: (bondId: string, value: string | null) => void;
    clearTopologyOverrides: () => void;
}

// Combined Store State.
// NOTE: the tabs and style-preset slices (PresetSlice & TabsSlice) are implemented
// in Task 7. Their types are folded into the union here (decision D6) so the kept
// slices typecheck. The composite store file itself is written in Task 7 (D5).
export type StructureState = DataSlice & UISlice & SceneSlice & StyleSlice & HistorySlice & PresetSlice & TabsSlice;
