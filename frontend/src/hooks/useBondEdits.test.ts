/**
 * Tests for useBondEdits — Task 3: unify bond-edit feedback.
 *
 * The hook owns the success toast after setBondsOrder / deleteBonds.
 * Assertions:
 *   (a) success path: notify called exactly once with 'success' severity
 *   (b) failure path: notify called exactly once with 'error' severity; NO success toast
 *   (c) setBondsOpacity: no notify call (opacity changes are silent, per parity decision)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBondEdits } from './useBondEdits';
import { useStructureStore } from '../store/useStructureStore';

// ── mock topologyRefresh ────────────────────────────────────────────────────
// We need to control whether the refresh succeeds or fails, and verify that
// the hook's notify calls are correct in each case.
const mockRefreshTopologyOrNotify = vi.fn();

vi.mock('../services/topologyRefresh', () => ({
    refreshTopology: vi.fn().mockResolvedValue(undefined),
    refreshTopologyOrNotify: (...args: unknown[]) => mockRefreshTopologyOrNotify(...args),
    default: vi.fn().mockResolvedValue(undefined),
}));

// ── helpers ─────────────────────────────────────────────────────────────────
const doc = () =>
    ({
        structure: { symbols: ['O', 'H', 'H'], positions: [[0,0,0],[1,0,0],[0,1,0]] },
        visualization: { bonds: [[0,1,1],[0,2,1]], h_bond_geometries: [], unwrapped_h_bonds: [], wrapped_ghost_bonds: [] },
    }) as never;

describe('useBondEdits — notify parity (Task 3)', () => {
    // Spy on the store's notify so we can count and inspect calls.
    let notifySpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
        useStructureStore.getState().addTab(doc(), 'w');
        useStructureStore.getState().clearSelection();

        // Spy on the store's real notify function
        notifySpy = vi.fn();
        useStructureStore.setState({ notify: notifySpy } as never);
    });

    // ── setBondsOrder ──────────────────────────────────────────────────────

    it('setBondsOrder: notifies success exactly once when refresh succeeds', async () => {
        // refreshTopologyOrNotify resolves true → success
        mockRefreshTopologyOrNotify.mockResolvedValue(true);

        const { result } = renderHook(() => useBondEdits());
        await act(async () => {
            await result.current.setBondsOrder(['0-1', '0-2'], '2.0');
        });

        expect(notifySpy).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith('Set order for 2 bond(s)', 'success');
    });

    it('setBondsOrder: notifies error exactly once (no success) when refresh fails', async () => {
        // refreshTopologyOrNotify calls notify('Bond refresh failed', 'error') internally
        // and returns false → no success toast from the hook
        mockRefreshTopologyOrNotify.mockImplementation(
            (notify: (msg: string, sev: string) => void) => {
                notify('Bond refresh failed', 'error');
                return Promise.resolve(false);
            },
        );

        const { result } = renderHook(() => useBondEdits());
        await act(async () => {
            await result.current.setBondsOrder(['0-1'], '2.0');
        });

        // Exactly one call — the error from the refresh; no second success call
        expect(notifySpy).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith('Bond refresh failed', 'error');
        // Confirm no success was fired
        const successCalls = notifySpy.mock.calls.filter(([, sev]) => sev === 'success');
        expect(successCalls).toHaveLength(0);
    });

    it('setBondsOrder: uses bond count in success message', async () => {
        mockRefreshTopologyOrNotify.mockResolvedValue(true);

        const { result } = renderHook(() => useBondEdits());
        await act(async () => {
            await result.current.setBondsOrder(['0-1'], '1.5');
        });

        expect(notifySpy).toHaveBeenCalledWith('Set order for 1 bond(s)', 'success');
    });

    it('setBondsOrder: does nothing when bondIds is empty (no notify)', async () => {
        const { result } = renderHook(() => useBondEdits());
        await act(async () => {
            await result.current.setBondsOrder([], '1.0');
        });

        expect(notifySpy).not.toHaveBeenCalled();
        expect(mockRefreshTopologyOrNotify).not.toHaveBeenCalled();
    });

    // ── deleteBonds ────────────────────────────────────────────────────────

    it('deleteBonds: notifies success exactly once when refresh succeeds', async () => {
        mockRefreshTopologyOrNotify.mockResolvedValue(true);

        const { result } = renderHook(() => useBondEdits());
        await act(async () => {
            await result.current.deleteBonds(['0-1', '0-2']);
        });

        expect(notifySpy).toHaveBeenCalledTimes(1);
        expect(notifySpy).toHaveBeenCalledWith('Deleted 2 bond(s)', 'success');
    });

    it('deleteBonds: notifies error exactly once (no success) when refresh fails', async () => {
        mockRefreshTopologyOrNotify.mockImplementation(
            (notify: (msg: string, sev: string) => void) => {
                notify('Bond refresh failed', 'error');
                return Promise.resolve(false);
            },
        );

        const { result } = renderHook(() => useBondEdits());
        await act(async () => {
            await result.current.deleteBonds(['0-1']);
        });

        expect(notifySpy).toHaveBeenCalledTimes(1);
        const successCalls = notifySpy.mock.calls.filter(([, sev]) => sev === 'success');
        expect(successCalls).toHaveLength(0);
    });

    it('deleteBonds: uses bond count in success message', async () => {
        mockRefreshTopologyOrNotify.mockResolvedValue(true);

        const { result } = renderHook(() => useBondEdits());
        await act(async () => {
            await result.current.deleteBonds(['0-1']);
        });

        expect(notifySpy).toHaveBeenCalledWith('Deleted 1 bond(s)', 'success');
    });

    it('deleteBonds: does nothing when bondIds is empty (no notify)', async () => {
        const { result } = renderHook(() => useBondEdits());
        await act(async () => {
            await result.current.deleteBonds([]);
        });

        expect(notifySpy).not.toHaveBeenCalled();
    });

    // ── setBondsOpacity ────────────────────────────────────────────────────
    // Opacity is a render-only change (no topology refresh). We keep it silent
    // (SelectionActionBar already notifies for opacity via bumpBondOpacity).
    // After Task 3 SelectionActionBar keeps its own opacity notify, so the hook
    // must NOT emit one.

    it('setBondsOpacity: does NOT notify (opacity toast stays in SelectionActionBar)', () => {
        const { result } = renderHook(() => useBondEdits());
        act(() => {
            result.current.setBondsOpacity(['0-1'], 0.5);
        });

        expect(notifySpy).not.toHaveBeenCalled();
    });
});
