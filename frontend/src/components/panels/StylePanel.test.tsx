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
    useStructureStore.setState({ selectedAtoms: [], colorOverrides: null, opacityOverrides: null });
    useStructureStore.getState().addTab(doc(), 'w');
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
});
