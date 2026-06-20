import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TransformPanel } from './TransformPanel';
import { useStructureStore } from '../../store/useStructureStore';
import { bondService } from '../../services/bondService';
import type { StandardStructureObject, Structure } from '../../types/store';

// ---------------------------------------------------------------------------
// Task 4: Theme 13 — TransformPanel tooltip glosses + Supercell caption
// ---------------------------------------------------------------------------
describe('TransformPanel Task 4 glosses', () => {
  beforeEach(() => {
    vi.mocked(bondService.translateStructure).mockReset();
    vi.mocked(bondService.buildSupercell).mockReset();
    useStructureStore.getState().clearStructure?.();
  });

  it('Lattice (frac) span wrapper has aria-label about fractional coordinates', () => {
    loadStructure(true);
    render(<TransformPanel />);
    const btn = screen.getByRole('button', { name: 'Lattice (frac)' });
    // Tooltip wraps the disabled button in a <span>; MUI sets aria-label on the span.
    // The button's own accessible name (from text content) is unaffected.
    const spanWrapper = btn.closest('[aria-label]');
    expect(spanWrapper).toBeTruthy();
    expect(spanWrapper?.getAttribute('aria-label')).toBe('Fractional cell coordinates (0–1 along each lattice vector)');
  });

  it('Lattice (frac) button still reachable by role/name when disabled (span wrapper)', () => {
    loadStructure(false);
    render(<TransformPanel />);
    // The button is disabled — wrapped in span so tooltip fires, but role/name must survive
    expect(screen.getByRole('button', { name: 'Lattice (frac)' })).toBeInTheDocument();
  });

  it('Wrap into cell span wrapper has aria-label about periodic boundary re-wrap', () => {
    loadStructure(true);
    render(<TransformPanel />);
    const checkbox = screen.getByRole('checkbox', { name: 'Wrap into cell' });
    // Tooltip wraps the disabled FormControlLabel in a <span>.
    const spanWrapper = checkbox.closest('[aria-label]');
    expect(spanWrapper).toBeTruthy();
    expect(spanWrapper?.getAttribute('aria-label')).toBe('Re-wrap atoms outside the cell back inside (periodic boundary)');
  });

  it('Wrap into cell checkbox still reachable by role/name when disabled (span wrapper)', () => {
    loadStructure(false);
    render(<TransformPanel />);
    expect(screen.getByRole('checkbox', { name: 'Wrap into cell' })).toBeInTheDocument();
  });

  it('Supercell section shows a caption gloss about repeating the unit cell', () => {
    loadStructure(true);
    render(<TransformPanel />);
    // Caption line adjacent to the Supercell heading — like the existing "Requires a unit cell." pattern
    expect(
      screen.getByText(/repeat the unit cell.*build a larger cell/i),
    ).toBeInTheDocument();
  });
});

vi.mock('../../services/bondService', () => ({
  bondService: {
    translateStructure: vi.fn(),
    buildSupercell: vi.fn(),
  },
}));

const makeStructure = (withCell: boolean): Structure => ({
  symbols: ['H', 'O'],
  positions: [[0, 0, 0], [0, 0, 0.96]],
  wrapped_positions: [[0, 0, 0], [0, 0, 0.96]],
  ...(withCell ? { cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]], pbc: [true, true, true] } : {}),
});

const makeDoc = (withCell: boolean): StandardStructureObject => ({
  structure: makeStructure(withCell),
  visualization: {
    bonds: [],
    wrapped_ghost_bonds: [],
    h_bond_geometries: [],
    unwrapped_h_bonds: [],
  },
});

const loadStructure = (withCell: boolean) => {
  // setStructureData stores the doc; clear history so past.length starts at 0.
  useStructureStore.getState().setStructureData(makeDoc(withCell));
  useStructureStore.setState({ past: [], future: [] });
};

describe('TransformPanel', () => {
  beforeEach(() => {
    vi.mocked(bondService.translateStructure).mockReset();
    vi.mocked(bondService.buildSupercell).mockReset();
    useStructureStore.getState().clearStructure?.();
  });

  it('renders the Transform header', () => {
    loadStructure(true);
    render(<TransformPanel />);
    expect(screen.getByText('Transform')).toBeInTheDocument();
  });

  it('disables Build / Lattice / Wrap when the structure has no cell', () => {
    loadStructure(false);
    render(<TransformPanel />);
    expect(screen.getByRole('button', { name: 'Build' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lattice (frac)' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Wrap into cell' })).toBeDisabled();
    // Cartesian translate stays usable.
    expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled();
  });

  it('enables cell-gated controls when a cell is present', () => {
    loadStructure(true);
    render(<TransformPanel />);
    expect(screen.getByRole('button', { name: 'Build' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lattice (frac)' })).not.toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Wrap into cell' })).not.toBeDisabled();
  });

  it('defaults Wrap into cell to CHECKED when the structure has a cell', () => {
    // A periodic structure should keep atoms inside the cell after a translate by default.
    loadStructure(true);
    render(<TransformPanel />);
    expect(screen.getByRole('checkbox', { name: 'Wrap into cell' })).toBeChecked();
  });

  it('passes wrap=true to translateStructure by default (cell present)', async () => {
    loadStructure(true);
    vi.mocked(bondService.translateStructure).mockResolvedValueOnce(makeDoc(true));
    render(<TransformPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(bondService.translateStructure).toHaveBeenCalled());
    // 4th arg is `wrap && hasCell` — true with the new default + a cell present.
    expect(vi.mocked(bondService.translateStructure).mock.calls[0][3]).toBe(true);
  });

  it('toggles the vector type from cartesian to lattice', () => {
    loadStructure(true);
    render(<TransformPanel />);
    const lattice = screen.getByRole('button', { name: 'Lattice (frac)' });
    expect(lattice).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(lattice);
    expect(lattice).toHaveAttribute('aria-pressed', 'true');
  });

  it('Apply pushes one history frame then sets the returned structure', async () => {
    loadStructure(true);
    const returnedDoc = makeDoc(true);
    vi.mocked(bondService.translateStructure).mockResolvedValueOnce(returnedDoc);

    const pushSpy = vi.spyOn(useStructureStore.getState(), 'pushHistory');
    const setSpy = vi.spyOn(useStructureStore.getState(), 'setStructureData');

    render(<TransformPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(bondService.translateStructure).toHaveBeenCalled());
    expect(pushSpy).toHaveBeenCalled();
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith(returnedDoc));
    // history pushed before the structure was replaced
    expect(pushSpy.mock.invocationCallOrder[0]).toBeLessThan(setSpy.mock.invocationCallOrder[0]);
  });

  it('Build pushes one history frame then sets the returned supercell', async () => {
    loadStructure(true);
    const returnedDoc = makeDoc(true);
    vi.mocked(bondService.buildSupercell).mockResolvedValueOnce(returnedDoc);

    const pushSpy = vi.spyOn(useStructureStore.getState(), 'pushHistory');
    const setSpy = vi.spyOn(useStructureStore.getState(), 'setStructureData');

    render(<TransformPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));

    await waitFor(() => expect(bondService.buildSupercell).toHaveBeenCalled());
    expect(pushSpy).toHaveBeenCalled();
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith(returnedDoc));
    expect(pushSpy.mock.invocationCallOrder[0]).toBeLessThan(setSpy.mock.invocationCallOrder[0]);
  });

  it('Apply error path: setStructureData NOT called, no history frame, buttons re-enable', async () => {
    loadStructure(true);
    vi.mocked(bondService.translateStructure).mockRejectedValueOnce(new Error('network fail'));

    // Spy after loadStructure then clear accumulated calls so only handler-triggered
    // calls are counted.
    const pushSpy = vi.spyOn(useStructureStore.getState(), 'pushHistory');
    const setSpy = vi.spyOn(useStructureStore.getState(), 'setStructureData');
    pushSpy.mockClear();
    setSpy.mockClear();

    render(<TransformPanel />);
    const applyBtn = screen.getByRole('button', { name: 'Apply' });
    fireEvent.click(applyBtn);

    await waitFor(() => expect(bondService.translateStructure).toHaveBeenCalled());
    // No structure update or undo frame on failure.
    expect(setSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    // Busy flag must be released so the button is usable again.
    await waitFor(() => expect(applyBtn).not.toBeDisabled());
  });

  it('Build error path: setStructureData NOT called, no history frame, buttons re-enable', async () => {
    loadStructure(true);
    vi.mocked(bondService.buildSupercell).mockRejectedValueOnce(new Error('too large'));

    // Spy after loadStructure then clear accumulated calls so only handler-triggered
    // calls are counted.
    const pushSpy = vi.spyOn(useStructureStore.getState(), 'pushHistory');
    const setSpy = vi.spyOn(useStructureStore.getState(), 'setStructureData');
    pushSpy.mockClear();
    setSpy.mockClear();

    render(<TransformPanel />);
    const buildBtn = screen.getByRole('button', { name: 'Build' });
    fireEvent.click(buildBtn);

    await waitFor(() => expect(bondService.buildSupercell).toHaveBeenCalled());
    expect(setSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(buildBtn).not.toBeDisabled());
  });

  it('Translate Apply does NOT clear topology/radius overrides', async () => {
    loadStructure(true);
    const returnedDoc = makeDoc(true);
    vi.mocked(bondService.translateStructure).mockResolvedValueOnce(returnedDoc);

    const clearTopSpy = vi.spyOn(useStructureStore.getState(), 'clearTopologyOverrides');
    const clearRadSpy = vi.spyOn(useStructureStore.getState(), 'setRadiusOverrides');

    render(<TransformPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(bondService.translateStructure).toHaveBeenCalled());
    expect(clearTopSpy).not.toHaveBeenCalled();
    expect(clearRadSpy).not.toHaveBeenCalled();
  });

  it('Supercell Build DOES clear topology/radius overrides', async () => {
    loadStructure(true);
    const returnedDoc = makeDoc(true);
    vi.mocked(bondService.buildSupercell).mockResolvedValueOnce(returnedDoc);

    const clearTopSpy = vi.spyOn(useStructureStore.getState(), 'clearTopologyOverrides');
    const clearRadSpy = vi.spyOn(useStructureStore.getState(), 'setRadiusOverrides');

    render(<TransformPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));

    await waitFor(() => expect(bondService.buildSupercell).toHaveBeenCalled());
    await waitFor(() => expect(clearTopSpy).toHaveBeenCalled());
    expect(clearRadSpy).toHaveBeenCalledWith(null);
  });

  describe('in-button spinner (B)', () => {
    it('Apply shows a progressbar while translateStructure is pending, then disappears after resolve', async () => {
      loadStructure(true);
      let resolve!: (v: ReturnType<typeof makeDoc>) => void;
      const pending = new Promise<ReturnType<typeof makeDoc>>((res) => { resolve = res; });
      vi.mocked(bondService.translateStructure).mockReturnValueOnce(pending);

      render(<TransformPanel />);
      const applyBtn = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyBtn);

      // While pending: at least one progressbar present, button disabled.
      await waitFor(() => expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0));
      expect(applyBtn).toBeDisabled();

      // Resolve the promise.
      await act(async () => { resolve(makeDoc(true)); });

      // After resolve: progressbar gone, button re-enabled.
      await waitFor(() => expect(screen.queryAllByRole('progressbar').length).toBe(0));
      await waitFor(() => expect(applyBtn).not.toBeDisabled());
    });

    it('Apply shows a progressbar while translateStructure is pending, then disappears after reject', async () => {
      loadStructure(true);
      let reject!: (e: Error) => void;
      const pending = new Promise<ReturnType<typeof makeDoc>>((_, rej) => { reject = rej; });
      vi.mocked(bondService.translateStructure).mockReturnValueOnce(pending);

      render(<TransformPanel />);
      const applyBtn = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyBtn);

      await waitFor(() => expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0));
      expect(applyBtn).toBeDisabled();

      await act(async () => { reject(new Error('network fail')); });

      await waitFor(() => expect(screen.queryAllByRole('progressbar').length).toBe(0));
      await waitFor(() => expect(applyBtn).not.toBeDisabled());
    });

    it('Build shows a progressbar while buildSupercell is pending, then disappears after resolve', async () => {
      loadStructure(true);
      let resolve!: (v: ReturnType<typeof makeDoc>) => void;
      const pending = new Promise<ReturnType<typeof makeDoc>>((res) => { resolve = res; });
      vi.mocked(bondService.buildSupercell).mockReturnValueOnce(pending);

      render(<TransformPanel />);
      const buildBtn = screen.getByRole('button', { name: 'Build' });
      fireEvent.click(buildBtn);

      await waitFor(() => expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0));
      expect(buildBtn).toBeDisabled();

      await act(async () => { resolve(makeDoc(true)); });

      await waitFor(() => expect(screen.queryAllByRole('progressbar').length).toBe(0));
      await waitFor(() => expect(buildBtn).not.toBeDisabled());
    });

    it('Build shows a progressbar while buildSupercell is pending, then disappears after reject', async () => {
      loadStructure(true);
      let reject!: (e: Error) => void;
      const pending = new Promise<ReturnType<typeof makeDoc>>((_, rej) => { reject = rej; });
      vi.mocked(bondService.buildSupercell).mockReturnValueOnce(pending);

      render(<TransformPanel />);
      const buildBtn = screen.getByRole('button', { name: 'Build' });
      fireEvent.click(buildBtn);

      await waitFor(() => expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0));
      expect(buildBtn).toBeDisabled();

      await act(async () => { reject(new Error('too large')); });

      await waitFor(() => expect(screen.queryAllByRole('progressbar').length).toBe(0));
      await waitFor(() => expect(buildBtn).not.toBeDisabled());
    });
  });
});
