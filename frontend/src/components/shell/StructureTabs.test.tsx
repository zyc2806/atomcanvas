import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitForElementToBeRemoved } from '@testing-library/react';
import { StructureTabs } from './StructureTabs';
import { useStructureStore } from '../../store/useStructureStore';

const fakeDoc = () => ({ structure: { symbols: ['O'], positions: [[0, 0, 0]] } }) as never;

// Reset every override surface so each test starts from a known pristine state.
const resetStore = () =>
  useStructureStore.setState({
    tabs: [],
    activeTabId: null,
    topologyOverrides: {},
    colorOverrides: null,
    opacityOverrides: null,
    radiusOverrides: null,
    perAtomColorOverrides: null,
    perAtomOpacityOverrides: null,
  });

describe('StructureTabs', () => {
  beforeEach(() => resetStore());

  it('renders a chip per tab and switches on click', () => {
    const a = useStructureStore.getState().addTab(fakeDoc(), 'water');
    useStructureStore.getState().addTab(fakeDoc(), 'slab');
    render(<StructureTabs />);
    fireEvent.click(screen.getByText('water'));
    expect(useStructureStore.getState().activeTabId).toBe(a);
  });

  it('closes a pristine tab immediately without a confirm dialog', () => {
    const a = useStructureStore.getState().addTab(fakeDoc(), 'water');
    useStructureStore.getState().addTab(fakeDoc(), 'slab'); // 'slab' is now active, 'water' pristine
    render(<StructureTabs />);

    // Click the delete icon on the pristine 'water' chip.
    const waterChip = screen.getByText('water').closest('.MuiChip-root') as HTMLElement;
    fireEvent.click(within(waterChip).getByTestId('CancelIcon'));

    // No dialog, tab gone.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useStructureStore.getState().tabs.find((t) => t.id === a)).toBeUndefined();
  });

  it('opens a confirm dialog when closing the ACTIVE tab with unsaved edits and does not close until confirmed', () => {
    useStructureStore.getState().addTab(fakeDoc(), 'water'); // active tab
    const activeId = useStructureStore.getState().activeTabId!;
    // Active tab edits live in the live store maps.
    useStructureStore.setState({ topologyOverrides: { '0-1': 'delete' } });
    render(<StructureTabs />);

    const waterChip = screen.getByText('water').closest('.MuiChip-root') as HTMLElement;
    fireEvent.click(within(waterChip).getByTestId('CancelIcon'));

    // Dialog shown, tab still present.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(useStructureStore.getState().tabs.find((t) => t.id === activeId)).toBeTruthy();
  });

  it('opens a confirm dialog when closing a BACKGROUND tab with unsaved edits (read from snapshot)', () => {
    const a = useStructureStore.getState().addTab(fakeDoc(), 'water');
    // Give 'water' an edit, then switch away so its edits land in its snapshot.
    useStructureStore.setState({ perAtomColorOverrides: { 0: '#ff0000' } });
    useStructureStore.getState().addTab(fakeDoc(), 'slab'); // snapshots 'water', 'slab' now active
    render(<StructureTabs />);

    const waterChip = screen.getByText('water').closest('.MuiChip-root') as HTMLElement;
    fireEvent.click(within(waterChip).getByTestId('CancelIcon'));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(useStructureStore.getState().tabs.find((t) => t.id === a)).toBeTruthy();
  });

  it('confirming the dialog calls the store close action and removes the tab', async () => {
    const closeSpy = vi.fn();
    const a = useStructureStore.getState().addTab(fakeDoc(), 'water');
    useStructureStore.setState({ topologyOverrides: { '0-1': 'delete' }, closeTab: closeSpy });
    render(<StructureTabs />);

    const waterChip = screen.getByText('water').closest('.MuiChip-root') as HTMLElement;
    fireEvent.click(within(waterChip).getByTestId('CancelIcon'));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(closeSpy).toHaveBeenCalledWith(a);
    await waitForElementToBeRemoved(dialog);
  });

  it('cancelling the dialog leaves the tab open and does not call close', async () => {
    const closeSpy = vi.fn();
    const a = useStructureStore.getState().addTab(fakeDoc(), 'water');
    useStructureStore.setState({ topologyOverrides: { '0-1': 'delete' }, closeTab: closeSpy });
    render(<StructureTabs />);

    const waterChip = screen.getByText('water').closest('.MuiChip-root') as HTMLElement;
    fireEvent.click(within(waterChip).getByTestId('CancelIcon'));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(closeSpy).not.toHaveBeenCalled();
    expect(useStructureStore.getState().tabs.find((t) => t.id === a)).toBeTruthy();
    await waitForElementToBeRemoved(dialog);
  });
});
