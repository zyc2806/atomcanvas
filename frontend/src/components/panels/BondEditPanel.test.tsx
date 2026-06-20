import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import BondEditPanel from './BondEditPanel';
import { useStructureStore } from '../../store/useStructureStore';
import { ORDER_LABELS } from '../../utils/bondOrders';

// refreshTopology hits the backend; stub it so the panel's store-mutation
// behaviour can be tested without a server.
vi.mock('../../services/topologyRefresh', () => ({
  refreshTopology: vi.fn().mockResolvedValue(undefined),
  refreshTopologyOrNotify: vi.fn().mockResolvedValue(true),
  default: vi.fn().mockResolvedValue(undefined),
}));

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

describe('BondEditPanel', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().clearSelection();
  });

  it('renders without the selection expression box (moved to Selection panel)', () => {
    const { container } = render(<BondEditPanel />);
    expect(container.querySelector('[aria-label="Apply Selection"]')).toBeNull();
  });

  it('enables Set order / Delete when a bond is clicked (selectedBonds set)', () => {
    useStructureStore.setState({ selectedBonds: ['0-1'] });
    render(<BondEditPanel />);
    expect(screen.getByRole('button', { name: /set order/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /delete bond/i })).toBeEnabled();
  });

  it('sets the chosen order on every selected bond', async () => {
    useStructureStore.setState({ selectedBonds: ['0-1', '1-2'] });
    render(<BondEditPanel />);
    fireEvent.click(screen.getByRole('button', { name: /set order/i }));
    await waitFor(() => {
      const o = useStructureStore.getState().topologyOverrides;
      expect(o['0-1']).toBe('1.0');
      expect(o['1-2']).toBe('1.0');
    });
  });

  it('deletes every selected bond', async () => {
    useStructureStore.setState({ selectedBonds: ['0-1', '1-2'] });
    render(<BondEditPanel />);
    fireEvent.click(screen.getByRole('button', { name: /delete bond/i }));
    await waitFor(() => {
      const o = useStructureStore.getState().topologyOverrides;
      expect(o['0-1']).toBe('delete');
      expect(o['1-2']).toBe('delete');
    });
  });

  it('falls back to the two-atom pair when no bond is clicked (create/edit)', async () => {
    useStructureStore.setState({ selectedAtoms: [0, 1], selectedBonds: [] });
    render(<BondEditPanel />);
    fireEvent.click(screen.getByRole('button', { name: /set order/i }));
    await waitFor(() => {
      expect(useStructureStore.getState().topologyOverrides['0-1']).toBe('1.0');
    });
  });

  it('shows guidance and disables nothing-to-act-on when selection is empty', () => {
    render(<BondEditPanel />);
    expect(screen.queryByRole('button', { name: /set order/i })).toBeNull();
    expect(screen.getByText(/click a bond/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Bond appearance tests (relocated from StylePanel.test.tsx)
// ---------------------------------------------------------------------------
describe('BondEditPanel bond appearance', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().replacePreset({
      presetName: 'default',
      elements: {},
      bondsStyle: { style: 'cylinder', colorMode: 'element-split' },
    });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().clearSelection();
  });

  it('bond radius slider drives visParams.bondRadius (single source of truth)', () => {
    render(<BondEditPanel />);
    fireEvent.change(screen.getByTestId('bond-radius'), { target: { value: '0.2' } });
    // visParams.bondRadius is the single source of truth read by the viewport
    // (Bonds.tsx) and all exporters. bondsStyle no longer carries a radius mirror.
    expect(useStructureStore.getState().visParams.bondRadius).toBeCloseTo(0.2);
  });

  it('Split/Uniform toggle writes bondsStyle.colorMode', () => {
    render(<BondEditPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Uniform' }));
    expect(useStructureStore.getState().bondsStyle.colorMode).toBe('uniform');
  });

  it('bond radius slider range is widened (0.01 – 2.0)', () => {
    render(<BondEditPanel />);
    const slider = screen.getByTestId('bond-radius');
    expect(slider).toHaveAttribute('min', '0.01');
    expect(slider).toHaveAttribute('max', '2');
  });
});

// ---------------------------------------------------------------------------
// Task 4: Theme 13 — Split/Uniform tooltip glosses, override heading rename,
// empty-state rename, and ORDER_LABELS-formatted override rows
// The span wrapper between <Tooltip> and <ToggleButton> absorbs the injected
// aria-label so the button keeps its text-derived accessible name.
// ---------------------------------------------------------------------------
describe('BondEditPanel Task 4 glosses and override list rewording', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().replacePreset({
      presetName: 'default',
      elements: {},
      bondsStyle: { style: 'cylinder', colorMode: 'element-split' },
    });
    useStructureStore.getState().addTab(
      { structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } } as never,
      'w',
    );
    useStructureStore.getState().clearSelection();
  });

  it('Split button is findable by its short accessible name "Split"', () => {
    render(<BondEditPanel />);
    expect(screen.getByRole('button', { name: 'Split' })).toBeInTheDocument();
  });

  it('the span wrapper carries the Split gloss aria-label (not the button)', () => {
    render(<BondEditPanel />);
    const btn = screen.getByRole('button', { name: 'Split' });
    const spanWrapper = btn.closest('span');
    expect(spanWrapper).toHaveAttribute('aria-label', "Each bond half takes its atom's element color");
  });

  it('Uniform button is findable by its short accessible name "Uniform"', () => {
    render(<BondEditPanel />);
    expect(screen.getByRole('button', { name: 'Uniform' })).toBeInTheDocument();
  });

  it('the span wrapper carries the Uniform gloss aria-label (not the button)', () => {
    render(<BondEditPanel />);
    const btn = screen.getByRole('button', { name: 'Uniform' });
    const spanWrapper = btn.closest('span');
    expect(spanWrapper).toHaveAttribute('aria-label', 'One color for all bonds');
  });

  it('override list heading reads "Your bond edits (n)" not "Manual overrides (n)"', () => {
    useStructureStore.setState({
      topologyOverrides: { '0-1': '2.0' },
    });
    render(<BondEditPanel />);
    expect(screen.getByText('Your bond edits (1)')).toBeInTheDocument();
    expect(screen.queryByText(/manual overrides/i)).toBeNull();
  });

  it('empty-state reads "No bond edits yet." not "No manual bond overrides."', () => {
    render(<BondEditPanel />);
    expect(screen.getByText('No bond edits yet.')).toBeInTheDocument();
    expect(screen.queryByText(/no manual bond overrides/i)).toBeNull();
  });

  it('formats override rows using ORDER_LABELS (e.g. "0–1: Double (2)" for 2.0)', () => {
    useStructureStore.setState({
      topologyOverrides: { '0-1': '2.0' },
    });
    render(<BondEditPanel />);
    const label = ORDER_LABELS['2.0'];
    expect(screen.getByText(`0–1: ${label}`)).toBeInTheDocument();
    // Must NOT show raw "→ 2.0" format
    expect(screen.queryByText(/0–1 → 2\.0/)).toBeNull();
  });

  it('formats delete overrides as "Deleted" instead of raw "→ delete"', () => {
    useStructureStore.setState({
      topologyOverrides: { '1-2': 'delete' },
    });
    render(<BondEditPanel />);
    expect(screen.getByText('1–2: Deleted')).toBeInTheDocument();
    expect(screen.queryByText(/1–2 → delete/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bond detection tests (relocated from ScenePanel — ScenePanel had no tests
// for threshold or H-bonds; these are new coverage for the moved controls)
// ---------------------------------------------------------------------------
describe('BondEditPanel bond detection', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().clearSelection();
    // Reset bond threshold to default
    useStructureStore.getState().setBondThreshold(1.1);
    useStructureStore.getState().setShowHBonds(false);
  });

  it('bond threshold slider writes visParams.bondThreshold', () => {
    render(<BondEditPanel />);
    fireEvent.change(screen.getByTestId('bond-threshold'), { target: { value: '1.3' } });
    expect(useStructureStore.getState().visParams.bondThreshold).toBeCloseTo(1.3);
  });

  it('bond threshold slider range is widened (0.4 – 3.0)', () => {
    render(<BondEditPanel />);
    const slider = screen.getByTestId('bond-threshold');
    expect(slider).toHaveAttribute('min', '0.4');
    expect(slider).toHaveAttribute('max', '3');
  });

  it('hydrogen bonds toggle writes visParams.showHBonds', () => {
    render(<BondEditPanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: /hydrogen bonds/i }));
    expect(useStructureStore.getState().visParams.showHBonds).toBe(true);
  });
});
