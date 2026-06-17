import { useStructureStore } from '../store/useStructureStore';
import { refreshTopology } from '../services/topologyRefresh';

/**
 * Bond edits shared by BondEditPanel and the floating SelectionActionBar.
 * Order/delete go through topologyOverrides + a topology refresh; opacity goes
 * through the bondOpacityOverrides render channel.
 */
export function useBondEdits() {
    const setTopologyOverride = useStructureStore((s) => s.setTopologyOverride);
    const setMultipleBondOpacityOverrides = useStructureStore((s) => s.setMultipleBondOpacityOverrides);

    const setBondsOrder = async (bondIds: string[], order: string) => {
        if (bondIds.length === 0) return;
        // Snapshot before the edit so the change is undoable (the snapshot now
        // captures topologyOverrides too, keeping undo of order/delete consistent).
        useStructureStore.getState().pushHistory();
        bondIds.forEach((id) => setTopologyOverride(id, order));
        await refreshTopology();
    };

    const deleteBonds = async (bondIds: string[]) => {
        if (bondIds.length === 0) return;
        useStructureStore.getState().pushHistory();
        bondIds.forEach((id) => setTopologyOverride(id, 'delete'));
        await refreshTopology();
    };

    const setBondsOpacity = (bondIds: string[], opacity: number) => {
        if (bondIds.length === 0) return;
        useStructureStore.getState().pushHistory();
        setMultipleBondOpacityOverrides(Object.fromEntries(bondIds.map((id) => [id, opacity])));
    };

    return { setBondsOrder, deleteBonds, setBondsOpacity };
}
