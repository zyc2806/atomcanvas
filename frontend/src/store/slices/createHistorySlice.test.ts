import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useStructureStore from '../../store/useStructureStore';

describe('createHistorySlice', () => {
  const mockStructureData = {
    structure: {
      symbols: ['H', 'H'],
      positions: [[0, 0, 0], [1, 0, 0]],
      cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
      pbc: [true, true, true]
    },
    visualization: { bonds: [], h_bond_geometries: [], unwrapped_h_bonds: [], wrapped_ghost_bonds: [] }
  };

  beforeEach(() => {
    const { result } = renderHook(() => useStructureStore());
    act(() => {
      // Initialize with some data
      result.current.setStructureData(mockStructureData as never);
      // Clear history
      useStructureStore.setState({ past: [], future: [] });
    });
  });

  it('should capture and restore full state in pushHistory/undo', () => {
    const { result } = renderHook(() => useStructureStore());

    // 1. Set up some state
    act(() => {
      result.current.updateSelection([0], 'replace');
      result.current.setVisParams({ displayMode: 'vdw', bondRadius: 0.5 });
      result.current.setViewControls({ showUnitCell: false });
      result.current.setSelectionExpression('elem:H');
      result.current.setMultipleBondOverrides({ '0-1': '#ff0000' });
      result.current.setCameraState({ position: [1, 2, 3], zoom: 2 });
      result.current.setClusterIndices([0, 1]);
      result.current.setSlabTarget(0);
      result.current.setColorOverrides({ 0: '#00ff00' });
      result.current.setAtomStyles({ H: { color: '#0000ff', radius: 1.2 } });
    });

    // 2. Push to history
    act(() => {
      result.current.pushHistory();
    });

    expect(result.current.past.length).toBe(1);

    // 3. Change state
    act(() => {
      result.current.updateSelection([1], 'replace');
      result.current.setVisParams({ displayMode: 'wireframe' });
    });

    // 4. Undo
    act(() => {
      result.current.undo();
    });

    // 5. Verify restored state
    expect(result.current.selectedAtoms).toEqual([0]);
    expect(result.current.visParams.displayMode).toBe('vdw');
    expect(result.current.visParams.bondRadius).toBe(0.5);
    expect(result.current.viewControls.showUnitCell).toBe(false);
    expect(result.current.selectionExpression).toBe('elem:H');
    expect(result.current.bondOverrides).toEqual({ '0-1': '#ff0000' });
    expect(result.current.cameraState).toEqual({ position: [1, 2, 3], zoom: 2 });
    expect(result.current.clusterIndices).toEqual([0, 1]);
    expect(result.current.slabTarget).toBe(0);
    expect(result.current.colorOverrides).toEqual({ 0: '#00ff00' });
    expect(result.current.atomStyles).toEqual({ H: { color: '#0000ff', radius: 1.2 } });
  });

  it('should capture and restore radiusOverrides through undo', () => {
    const { result } = renderHook(() => useStructureStore());

    act(() => {
      result.current.setRadiusOverrides({ 0: 1.5 });
    });
    act(() => {
      result.current.pushHistory();
    });
    act(() => {
      result.current.setRadiusOverrides({ 1: 0.5 });
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.radiusOverrides).toEqual({ 0: 1.5 });
  });

  it('should capture and restore full state in pushHistory/redo', () => {
    const { result } = renderHook(() => useStructureStore());

    // 1. Push initial state (empty selection)
    act(() => {
      result.current.pushHistory();
    });

    // 2. Change state (select atom 0)
    act(() => {
      result.current.updateSelection([0], 'replace');
      result.current.setVisParams({ displayMode: 'vdw' });
    });

    // 3. Undo
    act(() => {
      result.current.undo();
    });
    expect(result.current.selectedAtoms).toEqual([]);

    // 4. Redo
    act(() => {
      result.current.redo();
    });

    // 5. Verify restored state
    expect(result.current.selectedAtoms).toEqual([0]);
    expect(result.current.visParams.displayMode).toBe('vdw');
  });

  it('should handle Partial snapshots in pushHistory', () => {
    const { result } = renderHook(() => useStructureStore());

    act(() => {
        result.current.setVisParams({ displayMode: 'ball-stick' });
    });

    // Push partial snapshot
    act(() => {
      result.current.pushHistory({ visParams: { ...result.current.visParams, displayMode: 'vdw' } });
    });

    // Change current state
    act(() => {
      result.current.setVisParams({ displayMode: 'wireframe' });
    });

    // Undo should restore the partial snapshot's visParams
    act(() => {
      result.current.undo();
    });

    expect(result.current.visParams.displayMode).toBe('vdw');
  });
});
