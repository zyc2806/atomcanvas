import type { StateCreator } from 'zustand';
import { bondService } from '../../services/bondService';
import type {
    CameraSnapshot,
    ViewControls,
    VisualizationParams,
    StructureState,
    UISlice,
} from '../../types/store';
import axios from 'axios';

// module-level counter; safe because ESM imports are hoisted
let notificationCounter = 0;

// Interface imported from types/store
const generateExpressionFromSelection = (selectedAtoms: number[], symbols: string[]): string => {
    if (selectedAtoms.length === 0) return '';

    const counts: Record<string, number> = {};
    const atomLabels = symbols.map(symbol => {
        counts[symbol] = (counts[symbol] || 0) + 1;
        return `${symbol}${counts[symbol]}`;
    });

    const selectedLabels = selectedAtoms
        .map(idx => atomLabels[idx])
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return `label:${selectedLabels.join(',')}`;
};

type BondTuple = [number, number, number];

const bondLookupCache = new WeakMap<BondTuple[], Set<string>>();

const toBondId = (a: number, b: number): string => {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return `${min}-${max}`;
};

const buildBondLookup = (bonds: BondTuple[]): Set<string> => {
    const lookup = new Set<string>();
    bonds.forEach(([u, v]) => {
        lookup.add(toBondId(u, v));
    });
    return lookup;
};

const getBondLookup = (bonds: BondTuple[]): Set<string> => {
    const cached = bondLookupCache.get(bonds);
    if (cached) {
        return cached;
    }

    const lookup = buildBondLookup(bonds);
    bondLookupCache.set(bonds, lookup);
    return lookup;
};

const buildSelectedBonds = (bonds: BondTuple[] | undefined, selectedSet: Set<number>): string[] => {
    if (!bonds || selectedSet.size < 2) {
        return [];
    }

    const selectedBondIds = new Set<string>();
    bonds.forEach(([u, v]) => {
        if (selectedSet.has(u) && selectedSet.has(v)) {
            selectedBondIds.add(toBondId(u, v));
        }
    });

    return Array.from(selectedBondIds);
};

const isAdvancedExpression = (expr: string): boolean => {
    if (!expr) return false;
    return !expr.startsWith('label:') || expr.includes(' or ') || expr.includes(' and ') || expr.includes('(');
};

const getAtomLabel = (index: number, symbols: string[]): string => {
    const symbol = symbols[index];
    let count = 0;
    for (let i = 0; i <= index; i++) {
        if (symbols[i] === symbol) {
            count++;
        }
    }
    return `${symbol}${count}`;
};

export const createUISlice: StateCreator<StructureState, [], [], UISlice> = (set, get) => ({
    appThemeMode: 'dark',
    setAppThemeMode: (mode) => {
        set((state) => ({
            appThemeMode: mode,
            viewControls: { ...state.viewControls, tooltipTheme: mode },
        }));

        const state = get();
        if (!state.backgroundUserCustomized) {
            state.setBackgroundAuto({ solidColor: mode === 'dark' ? '#121212' : '#ffffff' });
        }
    },
    toggleAppThemeMode: () => {
        const state = get();
        state.setAppThemeMode(state.appThemeMode === 'dark' ? 'light' : 'dark');
    },
    viewControls: {
        showBonds: true,
        showHBonds: true,
        showUnitCell: true,
        showLabels: false,
        enableSelection: true,
        showOutline: false,
        showShadows: false,
        showAxesGizmo: true,
        forceTransparentBackground: false,
        tooltipTheme: 'dark',
        axesLabels: 'xyz',
    },
    visParams: {
        displayMode: 'ball-stick',
        bondThreshold: 1.0,
        bondRadius: 0.08,
        bondInferenceMode: 'auto',
        includeBondDiagnostics: false,
        atomScale: 0.7,
        showHBonds: false,
        hBondMaxDist: 3.5,
        hBondMinAngle: 120,
        hBondColor: '#808080',
        hBondDashSize: 0.2,
        hBondGapSize: 0.1,
        renderStyle: 'standard',
        cartoonParams: {
            outlineThickness: 3,
            highlightThreshold: 0.97,
            shadowThreshold: 0.3,
            shadowBrightness: 0.5,
        },
    },
    selectedAtoms: [],
    selectedBonds: [],
    adjacencyMap: new Map(),
    cameraState: null,
    colorOverrides: null,
    opacityOverrides: null,
    radiusOverrides: null,
    perAtomColorOverrides: null,
    perAtomOpacityOverrides: null,
    bondOverrides: null,
    bondOpacityOverrides: null,
    selectionMode: 'single',
    selectionExpression: '',
    clusterIndices: null,
    slabTarget: null,
    cameraViewTrigger: null,
    viewTarget: null,
    atomStyles: null,
    userHasInteracted: false,
    cameraType: 'perspective',
    cameraApplyRevision: 0,
    notification: null,

    rebuildAdjacencyMap: () => {},

    setViewControls: (controls) => set((state) => ({
        viewControls: { ...state.viewControls, ...controls }
    })),

    setVisParams: (params) => set((state) => ({
        visParams: { ...state.visParams, ...params }
    })),

    setViewTarget: (target) => set({ viewTarget: target }),

    applyCameraSnapshot: (snapshot: CameraSnapshot) => set((state) => ({
        cameraType: snapshot.type,
        viewTarget: [...snapshot.target] as [number, number, number],
        cameraState: {
            position: [...snapshot.state.position] as [number, number, number],
            up: snapshot.state.up ? ([...snapshot.state.up] as [number, number, number]) : undefined,
            zoom: snapshot.state.zoom,
        },
        userHasInteracted: true,
        cameraApplyRevision: state.cameraApplyRevision + 1,
    })),

    setDisplayMode: (mode) => set((state) => {
        let newParams: Partial<VisualizationParams> = { displayMode: mode };
        let newViewControls: Partial<ViewControls> = {};

        if (mode === 'ball-stick') {
            newParams = {
                ...newParams,
                atomScale: 0.7,
                bondRadius: 0.08
            };
            newViewControls = { showBonds: true };
        } else if (mode === 'vdw') {
            newParams = {
                ...newParams,
                atomScale: 1.0
            };
            newViewControls = { showBonds: false };
        } else if (mode === 'wireframe') {
            newParams = {
                ...newParams,
                bondRadius: 0.08
            };
            newViewControls = { showBonds: true };
        }

        return {
            visParams: { ...state.visParams, ...newParams },
            viewControls: { ...state.viewControls, ...newViewControls }
        };
    }),

    setShowHBonds: (show) => set((state) => ({
        visParams: { ...state.visParams, showHBonds: show }
    })),
    setHBondMaxDist: (dist) => set((state) => ({
        visParams: { ...state.visParams, hBondMaxDist: dist }
    })),
    setHBondMinAngle: (angle) => set((state) => ({
        visParams: { ...state.visParams, hBondMinAngle: angle }
    })),
    setBondThreshold: (threshold) => set((state) => ({
        visParams: { ...state.visParams, bondThreshold: threshold }
    })),
    setCameraType: (type: 'perspective' | 'orthographic') => set({ cameraType: type }),

    setCameraState: (cameraState) => set({ cameraState }),
    setColorOverrides: (overrides) => set({ colorOverrides: overrides }),
    setOpacityOverrides: (overrides) => set({ opacityOverrides: overrides }),
    setRadiusOverrides: (overrides) => set({ radiusOverrides: overrides }),
    applySelectionColor: (indices, color) => set((state) => {
        if (indices.length === 0) return {};
        const perAtom = { ...(state.perAtomColorOverrides ?? {}) };
        const visible = { ...(state.colorOverrides ?? {}) };
        indices.forEach((i) => { perAtom[i] = color; visible[i] = color; });
        return { perAtomColorOverrides: perAtom, colorOverrides: visible };
    }),
    applySelectionSize: (indices, scale) => set((state) => {
        if (indices.length === 0) return {};
        const next = { ...(state.radiusOverrides ?? {}) };
        indices.forEach((i) => { next[i] = scale; });
        return { radiusOverrides: next };
    }),
    toggleSelectionHidden: (indices) => set((state) => {
        if (indices.length === 0) return {};
        const perAtom = { ...(state.perAtomOpacityOverrides ?? {}) };
        const visible = { ...(state.opacityOverrides ?? {}) };
        const allHidden = indices.every((i) => perAtom[i] === 0);
        indices.forEach((i) => {
            if (allHidden) { delete perAtom[i]; delete visible[i]; }
            else { perAtom[i] = 0; visible[i] = 0; }
        });
        return {
            perAtomOpacityOverrides: Object.keys(perAtom).length ? perAtom : null,
            opacityOverrides: Object.keys(visible).length ? visible : null,
        };
    }),
    setBondOverride: (bondId, color) => set((state) => {
        const currentOverrides = state.bondOverrides || {};
        if (color === null) {
            const { [bondId]: removed, ...rest } = currentOverrides;
            void removed;
            return { bondOverrides: Object.keys(rest).length > 0 ? rest : null };
        }
        return { bondOverrides: { ...currentOverrides, [bondId]: color } };
    }),
    setMultipleBondOverrides: (overrides) => set((state) => {
        const currentOverrides = state.bondOverrides || {};
        const newOverrides = { ...currentOverrides };

        Object.entries(overrides).forEach(([bondId, color]) => {
            if (color === null) {
                delete newOverrides[bondId];
            } else {
                newOverrides[bondId] = color;
            }
        });

        return {
            bondOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : null
        };
    }),
    clearBondOverrides: () => set({ bondOverrides: null }),

    setBondOpacityOverride: (bondId, opacity) => set((state) => {
        const currentOverrides = state.bondOpacityOverrides || {};
        if (opacity === null) {
            const { [bondId]: removed, ...rest } = currentOverrides;
            void removed;
            return { bondOpacityOverrides: Object.keys(rest).length > 0 ? rest : null };
        }
        return { bondOpacityOverrides: { ...currentOverrides, [bondId]: opacity } };
    }),

    setMultipleBondOpacityOverrides: (overrides) => set((state) => {
        const currentOverrides = state.bondOpacityOverrides || {};
        const newOverrides = { ...currentOverrides };

        Object.entries(overrides).forEach(([bondId, opacity]) => {
            if (opacity === null) {
                delete newOverrides[bondId];
            } else {
                newOverrides[bondId] = opacity;
            }
        });

        return {
            bondOpacityOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : null
        };
    }),

    clearBondOpacityOverrides: () => set({ bondOpacityOverrides: null }),

    setAtomStyles: (styles) => set({ atomStyles: styles }),
    setUserHasInteracted: (hasInteracted) => set({ userHasInteracted: hasInteracted }),

    toggleSelection: (index) => set((state) => {
        const currentAtoms = state.selectedAtoms;
        const currentBonds = state.selectedBonds;
        const isSelected = currentAtoms.includes(index);

        let newAtoms: number[];
        let newBonds: string[] = [...currentBonds];

        if (isSelected) {
            newAtoms = currentAtoms.filter(i => i !== index);
            newBonds = newBonds.filter(bondId => {
                const [a, b] = bondId.split('-').map(Number);
                return a !== index && b !== index;
            });
        } else {
            newAtoms = [...currentAtoms, index];

            if (state.structureData?.visualization?.bonds) {
                const bonds = state.structureData.visualization.bonds;
                const bondLookup = getBondLookup(bonds);
                const nextBonds = new Set(newBonds);

                newAtoms.forEach((otherIdx) => {
                    if (otherIdx === index) {
                        return;
                    }

                    const bondId = toBondId(index, otherIdx);
                    if (bondLookup.has(bondId)) {
                        nextBonds.add(bondId);
                    }
                });

                newBonds = Array.from(nextBonds);
            }
        }

        const symbols = state.structureData?.structure.symbols || [];
        let selectionExpression = state.selectionExpression;

        if (isAdvancedExpression(selectionExpression)) {
            const label = getAtomLabel(index, symbols);
            if (isSelected) {
                const suffix = ` or label:${label}`;
                if (selectionExpression.endsWith(suffix)) {
                    selectionExpression = selectionExpression.slice(0, -suffix.length);
                } else {
                    selectionExpression = `(${selectionExpression}) and not label:${label}`;
                }
            } else {
                const suffix = ` and not label:${label}`;
                if (selectionExpression.endsWith(suffix)) {
                    selectionExpression = selectionExpression.slice(0, -suffix.length);
                } else {
                    selectionExpression = `(${selectionExpression}) or label:${label}`;
                }
            }
        } else {
            selectionExpression = generateExpressionFromSelection(newAtoms, symbols);
        }

        return {
            selectedAtoms: newAtoms,
            selectedBonds: newBonds,
            selectionExpression
        };
    }),

    toggleBondSelection: (bondId) => set((state) => {
        const currentSelection = state.selectedBonds;
        const isSelected = currentSelection.includes(bondId);

        if (isSelected) {
            return { selectedBonds: currentSelection.filter(id => id !== bondId) };
        }

        return { selectedBonds: [...currentSelection, bondId] };
    }),

    clearSelection: () => set({ selectedAtoms: [], selectedBonds: [], selectionExpression: '' }),

    updateSelection: (indices, operation) => set((state) => {
        const currentSelection = new Set(state.selectedAtoms);
        const newIndices = new Set(indices);
        let finalSelection: Set<number>;

        switch (operation) {
            case 'add':
                finalSelection = new Set([...currentSelection, ...newIndices]);
                break;
            case 'filter':
                finalSelection = new Set([...currentSelection].filter(x => newIndices.has(x)));
                break;
            case 'replace':
            default:
                finalSelection = newIndices;
                break;
        }

        const selectedAtoms = Array.from(finalSelection);
        const selectedBonds = buildSelectedBonds(
            state.structureData?.visualization?.bonds,
            finalSelection,
        );

        return {
            selectedAtoms,
            selectedBonds
        };
    }),

    setSelectionMode: (mode) => set((state) => ({
        selectionMode: mode,
        clusterIndices: mode === 'slab' ? state.clusterIndices : null,
        // Non-slab: drop transient slab/cluster coloring but keep per-atom styling.
        colorOverrides: mode === 'slab' ? state.colorOverrides : (state.perAtomColorOverrides ?? null),
        opacityOverrides: mode === 'slab' ? state.opacityOverrides : (state.perAtomOpacityOverrides ?? null),
        // radiusOverrides is purely per-atom user styling — never auto-cleared by mode.
        slabTarget: mode === 'slab' ? state.slabTarget : null,
        cameraViewTrigger: null,
    })),
    setSelectionExpression: (expression) => set({ selectionExpression: expression }),
    notify: (message, severity = 'info') => set({
        notification: { message, severity, key: ++notificationCounter },
    }),
    clearNotification: () => set({ notification: null }),

    setClusterIndices: (indices) => set({ clusterIndices: indices }),
    setSlabTarget: (id) => set({ slabTarget: id }),
    triggerCameraView: (position, target = [0, 0, 0], preserveDistance = false, up) => set({
        cameraViewTrigger: {
            position,
            target,
            timestamp: Date.now(),
            preserveDistance,
            up
        }
    }),

    updateVisualization: async () => {
        const { structureData, visParams, bondOverrides, activeTabId } = get();
        if (!structureData) return;
        if (!activeTabId) return;

        const originTabId = activeTabId;

        try {
            const data = await bondService.updateVisualization({
                structure: structureData.structure,
                bond_scale: visParams.bondThreshold,
                h_bond_distance_cutoff: visParams.hBondMaxDist,
                h_bond_angle_cutoff: visParams.hBondMinAngle,
                bond_overrides: bondOverrides || undefined,
                bond_inference_mode: visParams.bondInferenceMode ?? 'auto',
                include_bond_diagnostics: visParams.includeBondDiagnostics ?? false,
            });

            if (get().activeTabId !== originTabId) {
                return;
            }

            // Updating structureData via set (which is part of CombinedSlice)
            set((state) => ({
                ...(state.activeTabId !== originTabId ? {} : {
                structureData: {
                    ...state.structureData!, // Assert structureData exists because we checked
                    visualization: {
                        ...data,
                        fixed_atoms: state.structureData!.visualization.fixed_atoms
                    }
                }
                })
            }));
        } catch (error) {
            console.error("Failed to update visualization:", error);
            if (get().activeTabId !== originTabId) {
                return;
            }
            const errorMessage = axios.isAxiosError(error)
                ? error.response?.data?.detail || error.message
                : 'An unknown error occurred';
            set({ error: `Recalculation failed: ${errorMessage}` });
        }
    },

    resetUIState: () => set({
        selectedAtoms: [],
        selectedBonds: [],
        cameraState: null,
        clusterIndices: null,
        selectionMode: 'single',
        colorOverrides: null,
        opacityOverrides: null,
        radiusOverrides: null,
        perAtomColorOverrides: null,
        perAtomOpacityOverrides: null,
        bondOverrides: null,
        bondOpacityOverrides: null,
        slabTarget: null,
        cameraViewTrigger: null,
        viewTarget: null,
        userHasInteracted: false,
        selectionExpression: '',
        cameraApplyRevision: 0,
    }),

    // Clears slab-related state without affecting selectedAtoms or cameraState
    resetSlabState: () => set({
        clusterIndices: null,
        slabTarget: null,
        colorOverrides: null,
        opacityOverrides: null,
        radiusOverrides: null,
        perAtomColorOverrides: null,
        perAtomOpacityOverrides: null,
        bondOpacityOverrides: null,
        selectionMode: 'single',
    })
});
