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

describe('edit actions and history', () => {
  const data = {
    structure: {
      symbols: ['H', 'H'],
      positions: [[0, 0, 0], [1, 0, 0]],
      cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
      pbc: [true, true, true],
    },
    visualization: { bonds: [], h_bond_geometries: [], unwrapped_h_bonds: [], wrapped_ghost_bonds: [] },
  };

  beforeEach(() => {
    const { result } = renderHook(() => useStructureStore());
    act(() => {
      result.current.setStructureData(data as never);
      useStructureStore.setState({
        past: [],
        future: [],
        colorOverrides: null,
        opacityOverrides: null,
        radiusOverrides: null,
        perAtomColorOverrides: null,
        perAtomOpacityOverrides: null,
        topologyOverrides: {},
        elements: {},
      });
    });
  });

  it('toggleSelectionHidden snapshots history and undo reverts both opacity channels', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => { result.current.toggleSelectionHidden([0]); });
    expect(result.current.past.length).toBe(1);
    expect(result.current.opacityOverrides).toEqual({ 0: 0 });
    expect(result.current.perAtomOpacityOverrides).toEqual({ 0: 0 });
    act(() => { result.current.undo(); });
    expect(result.current.opacityOverrides).toBeNull();
    expect(result.current.perAtomOpacityOverrides).toBeNull();
  });

  it('does not snapshot history for an empty selection', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => { result.current.toggleSelectionHidden([]); });
    expect(result.current.past.length).toBe(0);
  });

  it('applySelectionColor/Size are live mutations that do NOT snapshot history themselves', () => {
    // Continuous controls (color picker / size slider) snapshot ONCE at the UI
    // gesture boundary, not on every tick — so the store actions must not push.
    const { result } = renderHook(() => useStructureStore());
    act(() => {
      result.current.applySelectionColor([0], '#ff0000');
      result.current.applySelectionColor([0], '#00ff00');
      result.current.applySelectionSize([0], 1.5);
    });
    expect(result.current.past.length).toBe(0);
  });

  it('one color gesture (push once, then live changes) is a single undo reverting both channels', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => {
      result.current.pushHistory();                        // UI snapshots once on gesture start
      result.current.applySelectionColor([0], '#ff0000');  // then the picker drags
      result.current.applySelectionColor([0], '#00ff00');
    });
    expect(result.current.past.length).toBe(1);
    expect(result.current.colorOverrides).toEqual({ 0: '#00ff00' });
    expect(result.current.perAtomColorOverrides).toEqual({ 0: '#00ff00' });
    act(() => { result.current.undo(); });
    expect(result.current.colorOverrides).toBeNull();
    expect(result.current.perAtomColorOverrides).toBeNull();
  });

  it('one size gesture is a single undo reverting radiusOverrides', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => {
      result.current.pushHistory();
      result.current.applySelectionSize([0], 1.2);
      result.current.applySelectionSize([0], 1.8);
    });
    expect(result.current.past.length).toBe(1);
    expect(result.current.radiusOverrides).toEqual({ 0: 1.8 });
    act(() => { result.current.undo(); });
    expect(result.current.radiusOverrides).toBeNull();
  });

  it('captures and restores per-element styles AND per-atom overrides through undo (Reset all styles is reversible)', () => {
    const { result } = renderHook(() => useStructureStore());

    // The user tuned per-element styling AND per-atom overrides.
    act(() => {
      result.current.setElementStyle('H', { color: '#abcdef', opacity: 0.4 });
      useStructureStore.setState({ perAtomColorOverrides: { 0: '#ff0000' } });
    });

    // Snapshot before the destructive reset.
    act(() => { result.current.pushHistory(); });

    // Reset all styles: wipe both the per-element map and the per-atom overrides
    // (mirrors the StylePanel "Reset all styles" button).
    act(() => {
      result.current.clearElementStyle('H');
      useStructureStore.setState({ perAtomColorOverrides: null });
    });
    expect(result.current.elements['H']).toBeUndefined();
    expect(result.current.perAtomColorOverrides).toBeNull();

    // Undo must restore BOTH — the bug today is the element map being lost.
    act(() => { result.current.undo(); });
    expect(result.current.elements['H']).toEqual({ color: '#abcdef', opacity: 0.4 });
    expect(result.current.perAtomColorOverrides).toEqual({ 0: '#ff0000' });
  });

  it('round-trips per-element styles through redo', () => {
    const { result } = renderHook(() => useStructureStore());

    act(() => { result.current.pushHistory(); });
    act(() => { result.current.setElementStyle('H', { radiusScale: 1.5 }); });
    act(() => { result.current.undo(); });
    expect(result.current.elements['H']).toBeUndefined();
    act(() => { result.current.redo(); });
    expect(result.current.elements['H']).toEqual({ radiusScale: 1.5 });
  });

  it('captures and restores topologyOverrides through undo', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => { useStructureStore.setState({ topologyOverrides: { '0-1': '1.0' } }); });
    act(() => { result.current.pushHistory(); });
    act(() => { useStructureStore.setState({ topologyOverrides: { '0-1': 'delete' } }); });
    act(() => { result.current.undo(); });
    expect(result.current.topologyOverrides).toEqual({ '0-1': '1.0' });
  });

  it('invalidates the redo stack when a new edit is made after an undo', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => { result.current.pushHistory(); result.current.setColorOverrides({ 0: '#ff0000' }); });
    act(() => { result.current.undo(); });
    expect(result.current.future.length).toBe(1);
    // A fresh edit clears the redo stack...
    act(() => { result.current.pushHistory(); });
    expect(result.current.future.length).toBe(0);
    // ...and redo is then a no-op.
    act(() => { result.current.redo(); });
    expect(result.current.future.length).toBe(0);
  });

  it('undoes and redoes multiple frames in LIFO order', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => { result.current.pushHistory(); result.current.setColorOverrides({ 0: '#ff0000' }); });
    act(() => { result.current.pushHistory(); result.current.setColorOverrides({ 0: '#00ff00' }); });
    expect(result.current.colorOverrides).toEqual({ 0: '#00ff00' });

    act(() => { result.current.undo(); });
    expect(result.current.colorOverrides).toEqual({ 0: '#ff0000' });
    act(() => { result.current.undo(); });
    expect(result.current.colorOverrides).toBeNull();

    act(() => { result.current.redo(); });
    expect(result.current.colorOverrides).toEqual({ 0: '#ff0000' });
    act(() => { result.current.redo(); });
    expect(result.current.colorOverrides).toEqual({ 0: '#00ff00' });
  });
});
