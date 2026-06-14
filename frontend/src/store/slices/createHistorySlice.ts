import type { StateCreator } from 'zustand';
import type { HistorySlice, StructureState, HistorySnapshot } from '../../types/store';

const MAX_HISTORY = 50;

const createSnapshot = (state: StructureState): HistorySnapshot => ({
    structure: structuredClone(state.structureData!),
    selectedAtoms: [...state.selectedAtoms],
    selectedBonds: [...state.selectedBonds],
    selectionExpression: state.selectionExpression,
    bondOverrides: state.bondOverrides ? { ...state.bondOverrides } : null,
    bondOpacityOverrides: state.bondOpacityOverrides ? { ...state.bondOpacityOverrides } : null,
    visParams: { ...state.visParams },
    viewControls: { ...state.viewControls },
    cameraState: state.cameraState ? { ...state.cameraState } : null,
    clusterIndices: state.clusterIndices ? [...state.clusterIndices] : null,
    slabTarget: state.slabTarget,
    colorOverrides: state.colorOverrides ? { ...state.colorOverrides } : null,
    opacityOverrides: state.opacityOverrides ? { ...state.opacityOverrides } : null,
    radiusOverrides: state.radiusOverrides ? { ...state.radiusOverrides } : null,
    perAtomColorOverrides: state.perAtomColorOverrides ? { ...state.perAtomColorOverrides } : null,
    perAtomOpacityOverrides: state.perAtomOpacityOverrides ? { ...state.perAtomOpacityOverrides } : null,
    atomStyles: state.atomStyles ? { ...state.atomStyles } : null,
});

export const createHistorySlice: StateCreator<StructureState, [], [], HistorySlice> = (set, get) => ({
    past: [],
    future: [],

    undo: () => {
        set((state) => {
            const { past, structureData, future } = state;

            // Cannot undo if no history or no current structure
            if (past.length === 0 || !structureData) {
                return state;
            }

            const previous = past[past.length - 1];
            const newPast = past.slice(0, past.length - 1);

                return {
                past: newPast,
                // Push current state to future
                future: [
                    createSnapshot(state),
                    ...future
                ].slice(0, MAX_HISTORY),
                // Restore previous state
                structureData: previous.structure,
                selectedAtoms: previous.selectedAtoms,
                selectedBonds: previous.selectedBonds,
                selectionExpression: previous.selectionExpression,
                bondOverrides: previous.bondOverrides,
                bondOpacityOverrides: previous.bondOpacityOverrides,
                visParams: previous.visParams,
                viewControls: previous.viewControls,
                cameraState: previous.cameraState,
                clusterIndices: previous.clusterIndices,
                slabTarget: previous.slabTarget,
                colorOverrides: previous.colorOverrides,
                    opacityOverrides: previous.opacityOverrides,
                    radiusOverrides: previous.radiusOverrides,
                    perAtomColorOverrides: previous.perAtomColorOverrides,
                    perAtomOpacityOverrides: previous.perAtomOpacityOverrides,
                    atomStyles: previous.atomStyles,
                };
        });
    },

    redo: () => {
        set((state) => {
            const { future, structureData, past } = state;

            // Cannot redo if no future or no current structure
            if (future.length === 0 || !structureData) {
                return state;
            }

            const next = future[0];
            const newFuture = future.slice(1);

                return {
                // Push current state to past
                past: [
                    ...past,
                    createSnapshot(state)
                ].slice(-MAX_HISTORY),
                future: newFuture,
                // Restore next state
                structureData: next.structure,
                selectedAtoms: next.selectedAtoms,
                selectedBonds: next.selectedBonds,
                selectionExpression: next.selectionExpression,
                bondOverrides: next.bondOverrides,
                bondOpacityOverrides: next.bondOpacityOverrides,
                visParams: next.visParams,
                viewControls: next.viewControls,
                cameraState: next.cameraState,
                clusterIndices: next.clusterIndices,
                slabTarget: next.slabTarget,
                colorOverrides: next.colorOverrides,
                    opacityOverrides: next.opacityOverrides,
                    radiusOverrides: next.radiusOverrides,
                    perAtomColorOverrides: next.perAtomColorOverrides,
                    perAtomOpacityOverrides: next.perAtomOpacityOverrides,
                    atomStyles: next.atomStyles,
                };
        });
    },

    pushHistory: (snapshot?: Partial<HistorySnapshot>) => {
        const state = get();

        const fullSnapshot: HistorySnapshot = {
            structure: structuredClone(snapshot?.structure ?? state.structureData!),
            selectedAtoms: snapshot?.selectedAtoms ?? [...state.selectedAtoms],
            selectedBonds: snapshot?.selectedBonds ?? [...state.selectedBonds],
            selectionExpression: snapshot?.selectionExpression ?? state.selectionExpression,
            bondOverrides: snapshot?.bondOverrides !== undefined ? snapshot.bondOverrides : (state.bondOverrides ? { ...state.bondOverrides } : null),
            bondOpacityOverrides: snapshot?.bondOpacityOverrides !== undefined ? snapshot.bondOpacityOverrides : (state.bondOpacityOverrides ? { ...state.bondOpacityOverrides } : null),
            visParams: snapshot?.visParams ?? { ...state.visParams },
            viewControls: snapshot?.viewControls ?? { ...state.viewControls },
            cameraState: snapshot?.cameraState !== undefined ? snapshot.cameraState : (state.cameraState ? { ...state.cameraState } : null),
            clusterIndices: snapshot?.clusterIndices !== undefined ? snapshot.clusterIndices : (state.clusterIndices ? [...state.clusterIndices] : null),
            slabTarget: snapshot?.slabTarget !== undefined ? snapshot.slabTarget : state.slabTarget,
            colorOverrides: snapshot?.colorOverrides !== undefined ? snapshot.colorOverrides : (state.colorOverrides ? { ...state.colorOverrides } : null),
            opacityOverrides: snapshot?.opacityOverrides !== undefined ? snapshot.opacityOverrides : (state.opacityOverrides ? { ...state.opacityOverrides } : null),
            radiusOverrides: snapshot?.radiusOverrides !== undefined ? snapshot.radiusOverrides : (state.radiusOverrides ? { ...state.radiusOverrides } : null),
            perAtomColorOverrides: snapshot?.perAtomColorOverrides !== undefined ? snapshot.perAtomColorOverrides : (state.perAtomColorOverrides ? { ...state.perAtomColorOverrides } : null),
            perAtomOpacityOverrides: snapshot?.perAtomOpacityOverrides !== undefined ? snapshot.perAtomOpacityOverrides : (state.perAtomOpacityOverrides ? { ...state.perAtomOpacityOverrides } : null),
            atomStyles: snapshot?.atomStyles !== undefined ? snapshot.atomStyles : (state.atomStyles ? { ...state.atomStyles } : null),
        };

        if (!fullSnapshot.structure) {
            return;
        }

        set((state) => ({
            past: [...state.past, fullSnapshot].slice(-MAX_HISTORY),
            future: [],
        }));
    },
});
