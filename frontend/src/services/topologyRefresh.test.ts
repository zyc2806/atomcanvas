import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshTopology, refreshTopologyOrNotify } from './topologyRefresh';
import { useStructureStore } from '../store/useStructureStore';
import { bondService } from './bondService';

vi.mock('./bondService', () => ({ bondService: { updateVisualization: vi.fn() } }));

const doc = () =>
    ({
        structure: { symbols: ['O', 'H'], positions: [[0, 0, 0], [1, 0, 0]] },
        visualization: { bonds: [[0, 1, 1]] },
    }) as never;

describe('refreshTopology', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
        useStructureStore.getState().addTab(doc(), 'w');
    });

    it('posts current structure + overrides + thresholds, stores returned visualization', async () => {
        (bondService.updateVisualization as ReturnType<typeof vi.fn>).mockResolvedValue({ bonds: [] });
        useStructureStore.getState().setTopologyOverride('0-1', 'delete');

        await refreshTopology();

        const call = (bondService.updateVisualization as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.bond_overrides).toEqual({ '0-1': 'delete' });
        expect(call.bond_scale).toBe(useStructureStore.getState().visParams.bondThreshold);
        expect(call.h_bond_distance_cutoff).toBe(useStructureStore.getState().visParams.hBondMaxDist);
        expect(call.h_bond_angle_cutoff).toBe(useStructureStore.getState().visParams.hBondMinAngle);
        expect(useStructureStore.getState().structureData?.visualization?.bonds).toEqual([]);
    });

    it('is a no-op when there is no active structure', async () => {
        useStructureStore.setState({ structureData: null });

        await refreshTopology();

        expect(bondService.updateVisualization as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    });
});

describe('refreshTopologyOrNotify', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
        useStructureStore.getState().addTab(doc(), 'w');
    });

    it('returns true and does NOT call notify when refreshTopology resolves', async () => {
        (bondService.updateVisualization as ReturnType<typeof vi.fn>).mockResolvedValue({ bonds: [] });
        const notify = vi.fn();

        const result = await refreshTopologyOrNotify(notify);

        expect(result).toBe(true);
        expect(notify).not.toHaveBeenCalled();
    });

    it('returns false and calls notify with error severity when refreshTopology rejects', async () => {
        (bondService.updateVisualization as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('network error'),
        );
        const notify = vi.fn();

        const result = await refreshTopologyOrNotify(notify);

        expect(result).toBe(false);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(expect.any(String), 'error');
    });
});
