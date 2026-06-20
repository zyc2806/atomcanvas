import type { StateCreator } from 'zustand';
import type { DataSlice, StructureState, Structure, StandardStructureObject } from '../../types/store';
import { selectionService } from '../../services/selectionService';

export const createDataSlice: StateCreator<StructureState, [], [], DataSlice> = (set, get) => ({
    structureData: null,
    loading: false,
    error: null,

    // D2: minimal setStructureData — the tabs slice owns multi-structure truth.
    setStructureData: (data) => {
        selectionService.clearCache();
        set({
            structureData: data,
            loading: false,
            error: null,
            selectedAtoms: [],
            selectedBonds: [],
        });
    },

    updateStructure: (newStructure: Structure | StandardStructureObject, expectedTabId?: string | null) => {
        selectionService.clearCache();
        const state = get();
        if (expectedTabId && state.activeTabId !== expectedTabId) {
            return;
        }

        if (state.structureData) {
            state.pushHistory({
                structure: state.structureData,
                selectedAtoms: state.selectedAtoms,
            });

            const oldAtomCount = state.structureData.structure.symbols.length;
            const newAtomCount = 'structure' in newStructure
                ? newStructure.structure.symbols.length
                : newStructure.symbols.length;

            const shouldClearOverrides = oldAtomCount !== newAtomCount;

            if ('visualization' in newStructure) {
                const nextStructure = newStructure as StandardStructureObject;
                set({
                    structureData: nextStructure,
                    loading: false,
                    error: null,
                    clusterIndices: shouldClearOverrides ? null : state.clusterIndices,
                    colorOverrides: shouldClearOverrides ? null : state.colorOverrides,
                    radiusOverrides: shouldClearOverrides ? null : state.radiusOverrides,
                    slabTarget: shouldClearOverrides ? null : state.slabTarget,
                    selectionMode: shouldClearOverrides ? 'single' : state.selectionMode,
                });
            } else {
                const structure = newStructure as Structure;
                set({
                    structureData: {
                        ...state.structureData,
                        structure: structure,
                        visualization: {
                            ...state.structureData.visualization,
                            bonds: [],
                        },
                    },
                    loading: false,
                    error: null,
                    clusterIndices: shouldClearOverrides ? null : state.clusterIndices,
                    colorOverrides: shouldClearOverrides ? null : state.colorOverrides,
                    radiusOverrides: shouldClearOverrides ? null : state.radiusOverrides,
                    slabTarget: shouldClearOverrides ? null : state.slabTarget,
                    selectionMode: shouldClearOverrides ? 'single' : state.selectionMode,
                });
            }
        }
    },

    setLoading: (isLoading, expectedTabId) => set((state) => {
        if (expectedTabId && expectedTabId !== state.activeTabId) {
            return {};
        }
        return { loading: isLoading };
    }),

    // Do not wipe structureData on error. Just set error state.
    setError: (errorMessage, expectedTabId) => set((state) => {
        if (expectedTabId && expectedTabId !== state.activeTabId) {
            return {};
        }
        return { error: errorMessage, loading: false };
    }),

    clearStructure: () => {
        selectionService.clearCache();
        set({
            structureData: null,
            loading: false,
            error: null,

            selectedAtoms: [],
            selectedBonds: [],
            cameraState: null,
            clusterIndices: null,
            selectionMode: 'single',
            colorOverrides: null,
            radiusOverrides: null,
            slabTarget: null,
            // Discard undo history with the structure so reopening a file can't
            // resurrect the closed one on the first undo, and the toolbar
            // Undo/Redo buttons correctly disable.
            past: [],
            future: [],
        });
    },
});
