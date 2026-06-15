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
        bondIds.forEach((id) => setTopologyOverride(id, order));
        await refreshTopology();
    };

    const deleteBonds = async (bondIds: string[]) => {
        if (bondIds.length === 0) return;
        bondIds.forEach((id) => setTopologyOverride(id, 'delete'));
        await refreshTopology();
    };

    const setBondsOpacity = (bondIds: string[], opacity: number) => {
        if (bondIds.length === 0) return;
        setMultipleBondOpacityOverrides(Object.fromEntries(bondIds.map((id) => [id, opacity])));
    };

    return { setBondsOrder, deleteBonds, setBondsOpacity };
}
