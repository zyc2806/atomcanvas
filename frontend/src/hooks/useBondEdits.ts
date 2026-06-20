import { useStructureStore } from '../store/useStructureStore';
import { refreshTopologyOrNotify } from '../services/topologyRefresh';

/**
 * Bond edits shared by BondEditPanel and the floating SelectionActionBar.
 * Order/delete go through topologyOverrides + a topology refresh; opacity goes
 * through the bondOpacityOverrides render channel.
 */
export function useBondEdits() {
    const setTopologyOverride = useStructureStore((s) => s.setTopologyOverride);
    const setMultipleBondOpacityOverrides = useStructureStore((s) => s.setMultipleBondOpacityOverrides);
    const notify = useStructureStore((s) => s.notify);

    const setBondsOrder = async (bondIds: string[], order: string) => {
        if (bondIds.length === 0) return;
        // Snapshot before the edit so the change is undoable (the snapshot now
        // captures topologyOverrides too, keeping undo of order/delete consistent).
        useStructureStore.getState().pushHistory();
        bondIds.forEach((id) => setTopologyOverride(id, order));
        const ok = await refreshTopologyOrNotify(notify);
        if (ok) notify(`Set order for ${bondIds.length} bond(s)`, 'success');
    };

    const deleteBonds = async (bondIds: string[]) => {
        if (bondIds.length === 0) return;
        useStructureStore.getState().pushHistory();
        bondIds.forEach((id) => setTopologyOverride(id, 'delete'));
        const ok = await refreshTopologyOrNotify(notify);
        if (ok) notify(`Deleted ${bondIds.length} bond(s)`, 'success');
    };

    const setBondsOpacity = (bondIds: string[], opacity: number) => {
        if (bondIds.length === 0) return;
        useStructureStore.getState().pushHistory();
        setMultipleBondOpacityOverrides(Object.fromEntries(bondIds.map((id) => [id, opacity])));
    };

    return { setBondsOrder, deleteBonds, setBondsOpacity };
}
