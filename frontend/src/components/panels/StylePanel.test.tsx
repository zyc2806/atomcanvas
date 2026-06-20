import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StylePanel } from './StylePanel';
import { useStructureStore } from '../../store/useStructureStore';

const doc = () =>
  ({
    structure: {
      symbols: ['O', 'H', 'H'],
      positions: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
    },
  }) as never;

describe('StylePanel', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().replacePreset({
      presetName: 'default',
      elements: {},
      bondsStyle: { style: 'cylinder', colorMode: 'element-split' },
    });
    useStructureStore.setState({
      selectedAtoms: [],
      colorOverrides: null,
      opacityOverrides: null,
      radiusOverrides: null,
      atomStyles: null,
    });
    useStructureStore.getState().addTab(doc(), 'w');
  });

  it('element colour swatch shows the CPK colour after atom styles load', () => {
    // useLoadAtomStyles populates CPK colours from atom.json into the store.
    useStructureStore.getState().setAtomStyles({
      O: { color: '#ff0000', radius: 0.66 },
      H: { color: '#ffffff', radius: 0.31 },
    });
    render(<StylePanel />);
    // jsdom normalises the hex background to rgb().
    expect(screen.getByTestId('color-O')).toHaveStyle({
      backgroundColor: 'rgb(255, 0, 0)',
    });
  });

  it('lists each distinct element once', () => {
    render(<StylePanel />);
    expect(screen.getByText('O')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + O + H
  });

  it('element opacity slider writes preset slice', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('opacity-O'), { target: { value: '0.4' } });
    expect(useStructureStore.getState().elements['O']?.opacity).toBeCloseTo(0.4);
  });

  it('element radius slider writes preset slice', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('radius-O'), { target: { value: '0.6' } });
    expect(useStructureStore.getState().elements['O']?.radiusScale).toBeCloseTo(0.6);
  });

  it('element radius slider range is widened (0.1 – 5.0)', () => {
    render(<StylePanel />);
    const slider = screen.getByTestId('radius-O');
    expect(slider).toHaveAttribute('min', '0.1');
    expect(slider).toHaveAttribute('max', '5');
  });

  it('clear button removes an element style', () => {
    useStructureStore.getState().setElementStyle('O', { color: '#101010' });
    render(<StylePanel />);
    fireEvent.click(screen.getByLabelText('reset-O'));
    expect(useStructureStore.getState().elements['O']).toBeUndefined();
  });

  it('does not render the Bonds section (moved to BondEditPanel)', () => {
    render(<StylePanel />);
    // The "Bonds" subtitle2 heading should no longer be in StylePanel
    expect(screen.queryByText('Bonds')).toBeNull();
    // bond-radius testid should also be gone
    expect(screen.queryByTestId('bond-radius')).toBeNull();
  });

  it('does not render the Scene heading or background/brightness controls (moved to ScenePanel)', () => {
    render(<StylePanel />);
    // The duplicate "Scene" subtitle2 heading should not be in StylePanel
    // (StylePanel previously had a "Scene" section — it has been removed)
    expect(screen.queryByTestId('brightness')).toBeNull();
  });

  it('element styles push per-atom color/opacity overrides', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('opacity-O'), { target: { value: '0.5' } });
    // O is index 0 in the structure
    expect(useStructureStore.getState().opacityOverrides?.[0]).toBeCloseTo(0.5);
  });

  // Theme 10 (Option A): restyle widgets removed from StylePanel — single canonical
  // surface is the floating SelectionActionBar. Coverage for color swatch and size
  // +/- buttons lives in SelectionActionBar.test.tsx (see "colour swatch reflects
  // the first selected atom colour override" and the mixed-selection size tests).
  it('no restyle widgets in StylePanel when atoms are selected', () => {
    useStructureStore.setState({ selectedAtoms: [1, 2] });
    render(<StylePanel />);
    // color picker and size slider are gone
    expect(screen.queryByTestId('selected-color')).toBeNull();
    expect(screen.queryByTestId('selected-size')).toBeNull();
  });

  it('shows pointer hint to action bar when atoms are selected', () => {
    useStructureStore.setState({ selectedAtoms: [1, 2] });
    render(<StylePanel />);
    expect(
      screen.getByText(/recolor or resize selected atoms from the toolbar/i),
    ).toBeInTheDocument();
  });

  it('pointer hint is hidden when nothing is selected', () => {
    useStructureStore.setState({ selectedAtoms: [] });
    render(<StylePanel />);
    expect(
      screen.queryByText(/recolor or resize selected atoms from the toolbar/i),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 4: Theme 13 — vdW tooltip gloss
// The span wrapper between <Tooltip> and <ToggleButton> absorbs the injected
// aria-label so the button keeps its text-derived accessible name "vdW".
// ---------------------------------------------------------------------------
describe('StylePanel vdW tooltip', () => {
  it('vdW ToggleButton is findable by its short accessible name "vdW"', () => {
    render(<StylePanel />);
    // The button's accessible name is derived from its text content, not the tooltip.
    expect(screen.getByRole('button', { name: 'vdW' })).toBeInTheDocument();
  });

  it('the span wrapper carries the gloss tooltip aria-label (not the button)', () => {
    render(<StylePanel />);
    // MUI v7 Tooltip sets aria-label on the span, not the button inside it.
    const btn = screen.getByRole('button', { name: 'vdW' });
    const spanWrapper = btn.closest('span');
    expect(spanWrapper).toHaveAttribute('aria-label', 'Van der Waals spheres (space-filling)');
  });
});

describe('StylePanel display mode', () => {
  beforeEach(() => {
    useStructureStore.getState().setDisplayMode('ball-stick');
  });

  it('vdW toggle sets displayMode to vdw, scales atoms up and hides bonds', () => {
    render(<StylePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'vdW' }));
    const s = useStructureStore.getState();
    expect(s.visParams.displayMode).toBe('vdw');
    expect(s.visParams.atomScale).toBeCloseTo(1.0);
    expect(s.viewControls.showBonds).toBe(false);
  });

  it('Wireframe toggle sets displayMode to wireframe and keeps bonds shown', () => {
    render(<StylePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Wireframe' }));
    const s = useStructureStore.getState();
    expect(s.visParams.displayMode).toBe('wireframe');
    expect(s.viewControls.showBonds).toBe(true);
  });

  it('Ball & stick toggle restores ball-and-stick presets', () => {
    useStructureStore.getState().setDisplayMode('vdw');
    render(<StylePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Ball & stick' }));
    const s = useStructureStore.getState();
    expect(s.visParams.displayMode).toBe('ball-stick');
    expect(s.visParams.atomScale).toBeCloseTo(0.7);
    expect(s.visParams.bondRadius).toBeCloseTo(0.08);
    expect(s.viewControls.showBonds).toBe(true);
  });

  it('re-clicking the active mode keeps it selected (no null write)', () => {
    useStructureStore.getState().setDisplayMode('vdw');
    render(<StylePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'vdW' }));
    expect(useStructureStore.getState().visParams.displayMode).toBe('vdw');
  });
});

describe('StylePanel "Reset all styles" is reversible', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().replacePreset({
      presetName: 'default',
      elements: {},
      bondsStyle: { style: 'cylinder', colorMode: 'element-split' },
    });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.setState({
      selectedAtoms: [],
      colorOverrides: null,
      opacityOverrides: null,
      radiusOverrides: null,
      atomStyles: null,
      past: [],
      future: [],
      notification: null,
    });
  });

  it('snapshots history BEFORE wiping styles so the reset is undoable', () => {
    useStructureStore.getState().setElementStyle('O', { color: '#101010' });
    render(<StylePanel />);
    expect(useStructureStore.getState().past.length).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Reset all styles' }));

    // One undo frame captured before the wipe; element map is now empty.
    expect(useStructureStore.getState().past.length).toBe(1);
    expect(useStructureStore.getState().elements['O']).toBeUndefined();

    // The captured snapshot still holds the pre-reset per-element style, so undo recovers it.
    useStructureStore.getState().undo();
    expect(useStructureStore.getState().elements['O']).toEqual({ color: '#101010' });
  });

  it('fires a confirmation notification after resetting', () => {
    render(<StylePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset all styles' }));
    expect(useStructureStore.getState().notification?.message).toBe('Reset all styles');
  });
});

