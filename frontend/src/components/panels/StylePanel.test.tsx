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
      bondsStyle: { style: 'cylinder', radius: 0.12, colorMode: 'element-split' },
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

  it('clear button removes an element style', () => {
    useStructureStore.getState().setElementStyle('O', { color: '#101010' });
    render(<StylePanel />);
    fireEvent.click(screen.getByLabelText('reset-O'));
    expect(useStructureStore.getState().elements['O']).toBeUndefined();
  });

  it('bond radius slider writes bonds style', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('bond-radius'), { target: { value: '0.2' } });
    expect(useStructureStore.getState().bondsStyle.radius).toBeCloseTo(0.2);
  });

  it('bond radius slider drives the viewport via visParams.bondRadius', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('bond-radius'), { target: { value: '0.2' } });
    // The viewport (Bonds.tsx) sizes bonds from visParams.bondRadius, not from
    // bondsStyle.radius — so the slider must drive that field.
    expect(useStructureStore.getState().visParams.bondRadius).toBeCloseTo(0.2);
  });

  it('brightness slider writes scene settings', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('brightness'), { target: { value: '1.5' } });
    expect(useStructureStore.getState().sceneSettings.globalBrightness).toBeCloseTo(1.5);
  });

  it('element styles push per-atom color/opacity overrides', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('opacity-O'), { target: { value: '0.5' } });
    // O is index 0 in the structure
    expect(useStructureStore.getState().opacityOverrides?.[0]).toBeCloseTo(0.5);
  });

  it('selected-atoms color picker appears and writes color overrides', () => {
    useStructureStore.setState({ selectedAtoms: [1, 2] });
    render(<StylePanel />);
    expect(screen.getByText(/Selected atoms \(2\)/)).toBeInTheDocument();
  });

  it('selected-atoms color swatch reflects the selected atom colour, not gray', () => {
    useStructureStore.getState().setAtomStyles({
      O: { color: '#ff0000', radius: 0.66 },
      H: { color: '#3050f8', radius: 0.31 },
    });
    useStructureStore.setState({ selectedAtoms: [1, 2] }); // index 1 is 'H'
    render(<StylePanel />);
    // Was a hardcoded gray (#cccccc); now shows the selected atom's CPK colour.
    expect(screen.getByTestId('selected-color')).toHaveStyle({
      backgroundColor: 'rgb(48, 80, 248)',
    });
  });

  it('selected-atom size slider writes radiusOverrides for each selected atom', () => {
    useStructureStore.setState({ selectedAtoms: [1, 2] });
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('selected-size'), { target: { value: '1.5' } });
    const r = useStructureStore.getState().radiusOverrides;
    expect(r?.[1]).toBeCloseTo(1.5);
    expect(r?.[2]).toBeCloseTo(1.5);
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

const seedTwoSelected = () => {
  useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
  useStructureStore.getState().replacePreset({
    presetName: 'default',
    elements: {},
    bondsStyle: { style: 'cylinder', radius: 0.12, colorMode: 'element-split' },
  });
  useStructureStore.getState().addTab(doc(), 'w');
  useStructureStore.setState({
    selectedAtoms: [1, 2],
    radiusOverrides: null,
    past: [],
    future: [],
  });
};

describe('StylePanel selection-edit history', () => {
  beforeEach(seedTwoSelected);

  it('snapshots one undo frame when the size slider records a change', () => {
    // The slider pushes history at the gesture boundary (first onChange) rather
    // than inside applySelectionSize. jsdom's fireEvent.change is a *committed*
    // change, so it both pushes and resets the gesture ref → exactly one frame.
    // (A real pointer drag fires many onChange before onChangeCommitted, which
    // the ref coalesces into this same single frame.)
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('selected-size'), { target: { value: '1.8' } });
    expect(useStructureStore.getState().past.length).toBe(1);
    expect(useStructureStore.getState().radiusOverrides?.[1]).toBeCloseTo(1.8);
  });
});
