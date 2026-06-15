import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionActionBar } from './SelectionActionBar';
import { useStructureStore } from '../../store/useStructureStore';

describe('SelectionActionBar', () => {
  beforeEach(() => useStructureStore.setState({
    selectedAtoms: [], colorOverrides: null, opacityOverrides: null,
    radiusOverrides: null, perAtomColorOverrides: null, perAtomOpacityOverrides: null,
  }));

  it('renders nothing when no atoms are selected', () => {
    render(<SelectionActionBar />);
    expect(screen.queryByText(/selected/i)).not.toBeInTheDocument();
  });

  it('shows the selection count when atoms are selected', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1, 2] });
    render(<SelectionActionBar />);
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
  });

  it('hide button hides the selected atoms', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1] });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /hide/i }));
    expect(useStructureStore.getState().opacityOverrides).toMatchObject({ 0: 0, 1: 0 });
  });

  it('clear button empties the selection', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1] });
    render(<SelectionActionBar />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(useStructureStore.getState().selectedAtoms).toEqual([]);
  });

  it('colour control opens a hex picker (matches the sidebar), not preset swatches', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1] });
    render(<SelectionActionBar />);
    // The old fixed preset swatches (aria-label "color #rrggbb") are gone.
    expect(screen.queryByLabelText(/^color #/i)).toBeNull();
    fireEvent.click(screen.getByTestId('selection-color'));
    expect(document.querySelector('.react-colorful')).not.toBeNull();
  });

  it('colour swatch reflects the first selected atom colour override', () => {
    useStructureStore.setState({ selectedAtoms: [0, 1], colorOverrides: { 0: '#123456' } });
    render(<SelectionActionBar />);
    // jsdom normalises the hex background to rgb().
    expect(screen.getByTestId('selection-color')).toHaveStyle({
      backgroundColor: 'rgb(18, 52, 86)',
    });
  });
});
