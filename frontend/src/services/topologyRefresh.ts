import { useStructureStore } from '../store/useStructureStore';
import { bondService } from './bondService';

/**
 * Recompute the active structure's bond topology from the current topology
 * overrides + thresholds, then store the fresh Visualization back into
 * structureData. No-op when there is no active structure.
 */
export async function refreshTopology(): Promise<void> {
    const s = useStructureStore.getState();
    if (!s.structureData) return;

    const visualization = await bondService.updateVisualization({
        structure: s.structureData.structure,
        bond_overrides: s.topologyOverrides,
        bond_scale: s.visParams.bondThreshold,
        h_bond_distance_cutoff: s.visParams.hBondMaxDist,
        h_bond_angle_cutoff: s.visParams.hBondMinAngle,
    });

    s.setStructureData({ ...s.structureData, visualization });
}

export default refreshTopology;
