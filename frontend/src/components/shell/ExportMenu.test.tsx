import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { ExportMenu } from './ExportMenu';
import { useStructureStore } from '../../store/useStructureStore';
import * as batchExport from '../../services/batchExport';
import type { Structure, StandardStructureObject } from '../../types/store';

// Stub network call so Export button doesn't fire real HTTP
vi.mock('../../services/structureService', async (orig) => {
    const actual = await orig<typeof import('../../services/structureService')>();
    return {
        ...actual,
        structureService: {
            ...actual.structureService,
            exportStructure: vi.fn().mockResolvedValue({ blob: new Blob(), warnings: [] }),
        },
    };
});

// Stub the download helper so no anchor/blob is created
vi.mock('../../services/download', async (orig) => {
    const actual = await orig<typeof import('../../services/download')>();
    return { ...actual, downloadBlob: vi.fn() };
});

// Stub the export helpers so PNG/batch actions don't touch WebGL; we only assert
// the resolution scale is threaded through.
vi.mock('../../services/batchExport', async (orig) => {
    const actual = await orig<typeof import('../../services/batchExport')>();
    return {
        ...actual,
        exportCurrentPng: vi.fn(),
        batchExportPng: vi.fn(),
    };
});

const makeStructure = (): Structure => ({
    symbols: ['O'],
    positions: [[0, 0, 0]],
    wrapped_positions: [[0, 0, 0]],
});

const makeDoc = (trajectoryLength = 0): StandardStructureObject => ({
    structure: makeStructure(),
    visualization: {
        bonds: [],
        wrapped_ghost_bonds: [],
        h_bond_geometries: [],
        unwrapped_h_bonds: [],
    },
    ...(trajectoryLength > 0
        ? { trajectory: Array.from({ length: trajectoryLength }, makeStructure) }
        : {}),
});

/** Open the Export menu, then click "Structure file…" to open the dialog. */
function openStructureDialog() {
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    fireEvent.click(screen.getByText(/structure file/i));
}

/** Open the Format Select dropdown so options become available in DOM. */
function openFormatSelect() {
    // The MUI Select renders a combobox; clicking it opens the listbox.
    const combo = screen.getByRole('combobox');
    fireEvent.mouseDown(combo);
}

describe('ExportMenu — structure format dialog', () => {
    beforeEach(() => {
        useStructureStore.setState({
            structureData: makeDoc(),
            tabs: [],
            activeTabId: null,
        });
    });

    it('dialog opens and lists expanded format set', () => {
        render(<ExportMenu />);
        openStructureDialog();
        openFormatSelect();

        // These formats are present in the expanded set but NOT in the old 5-item list
        expect(screen.getByRole('option', { name: /ASE Trajectory/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /XDATCAR/i })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: /ASE JSON/i })).toBeInTheDocument();
    });

    it('"Full trajectory" radio is DISABLED when store has no trajectory', () => {
        render(<ExportMenu />);
        openStructureDialog();

        const radio = screen.getByRole('radio', { name: /full trajectory/i });
        expect(radio).toBeDisabled();
    });

    it('"Full trajectory" radio is ENABLED when structureData.trajectory has 2 frames', () => {
        useStructureStore.setState({
            structureData: makeDoc(2),
            tabs: [],
            activeTabId: null,
        });
        render(<ExportMenu />);
        openStructureDialog();

        const radio = screen.getByRole('radio', { name: /full trajectory/i });
        expect(radio).not.toBeDisabled();
    });

    it('switching scope to full_trajectory filters formats to multi-frame ones only', () => {
        useStructureStore.setState({
            structureData: makeDoc(2),
            tabs: [],
            activeTabId: null,
        });
        render(<ExportMenu />);
        openStructureDialog();

        const radio = screen.getByRole('radio', { name: /full trajectory/i });
        fireEvent.click(radio);

        // Open the Select to check which options are available
        openFormatSelect();

        // single-frame-only formats must NOT be present
        expect(screen.queryByRole('option', { name: /^XYZ \(\.xyz\)$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /^POSCAR/i })).not.toBeInTheDocument();
        // multi-frame formats remain
        expect(screen.getByRole('option', { name: /Extended XYZ/i })).toBeInTheDocument();
    });

    it('XDATCAR option label is still present after value change to vasp-xdatcar', () => {
        // Part B: the XDATCAR entry value changed from 'xdatcar' to 'vasp-xdatcar'
        // but the displayed label must still match /XDATCAR/.
        render(<ExportMenu />);
        openStructureDialog();
        openFormatSelect();

        expect(screen.getByRole('option', { name: /XDATCAR/i })).toBeInTheDocument();
    });

    it('scope resets to current_frame when dialog is reopened after full_trajectory selection', () => {
        // Bug: scope is component state persisting across dialog open/close.
        // If a user picks "Full trajectory", cancels, then the next open keeps
        // scope='full_trajectory' (stale). Fix: reset scope to 'current_frame' on open.
        useStructureStore.setState({
            structureData: makeDoc(2),
            tabs: [],
            activeTabId: null,
        });
        render(<ExportMenu />);

        // First open: pick Full trajectory
        openStructureDialog();
        const trajRadio = screen.getByRole('radio', { name: /full trajectory/i });
        fireEvent.click(trajRadio);
        expect(trajRadio).toBeChecked();

        // Cancel (close dialog via Cancel button)
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

        // Second open: use the Export button then the menuitem by its role
        fireEvent.click(screen.getByRole('button', { name: /export/i }));
        // "Structure file…" menu item — use getAllByText and pick the one that is
        // a menuitem, to avoid ambiguity with the dialog title once it reopens.
        const menuItems = screen.getAllByText(/structure file/i);
        const structureMenuItem = menuItems.find(
            (el) => el.closest('[role="menuitem"]') !== null,
        );
        fireEvent.click(structureMenuItem!);

        // Scope must reset to current_frame
        const currentFrameRadio = screen.getByRole('radio', { name: /current frame/i });
        expect(currentFrameRadio).toBeChecked();
        const fullTrajRadio2 = screen.getByRole('radio', { name: /full trajectory/i });
        expect(fullTrajRadio2).not.toBeChecked();
    });
});

describe('ExportMenu — PNG resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStructureStore.setState({
            structureData: makeDoc(),
            tabs: [],
            activeTabId: null,
            exportScale: 1,
        });
        // Give the batch action a tab so "Batch PNG" isn't disabled.
        useStructureStore.getState().addTab(makeDoc(), 'tab1');
    });

    function openExportMenu() {
        fireEvent.click(screen.getByRole('button', { name: /export/i }));
    }

    function selectResolution(label: RegExp) {
        // The resolution Select exposes an accessible name "PNG resolution".
        const combo = screen.getByRole('combobox', { name: /png resolution/i });
        fireEvent.mouseDown(combo);
        const listbox = screen.getByRole('listbox');
        fireEvent.click(within(listbox).getByRole('option', { name: label }));
    }

    it('threads the selected 2× resolution into exportCurrentPng', () => {
        render(<ExportMenu />);
        openExportMenu();
        selectResolution(/^2×$/);

        // Store reflects the new scale.
        expect(useStructureStore.getState().exportScale).toBe(2);

        fireEvent.click(screen.getByText(/png \(current\)/i));
        expect(batchExport.exportCurrentPng).toHaveBeenCalledWith(2);
    });

    it('threads the selected 2× resolution into batchExportPng', () => {
        render(<ExportMenu />);
        openExportMenu();
        selectResolution(/^2×$/);

        fireEvent.click(screen.getByText(/batch: all tabs → png/i));
        expect(batchExport.batchExportPng).toHaveBeenCalledWith(2);
    });

    it('defaults to 1× when the resolution is untouched', () => {
        render(<ExportMenu />);
        openExportMenu();

        fireEvent.click(screen.getByText(/png \(current\)/i));
        expect(batchExport.exportCurrentPng).toHaveBeenCalledWith(1);
    });
});

describe('ExportMenu — global notify (no local toast)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStructureStore.setState({
            structureData: makeDoc(),
            tabs: [],
            activeTabId: null,
            exporting: false,
        });
        useStructureStore.getState().addTab(makeDoc(), 'tab1');
    });

    it('routes export failures through the store notify with severity "error"', async () => {
        const notify = vi.fn();
        useStructureStore.setState({ notify });
        vi.mocked(batchExport.batchExportPng).mockRejectedValueOnce(new Error('render failed'));

        render(<ExportMenu />);
        fireEvent.click(screen.getByRole('button', { name: /export/i }));
        await act(async () => {
            fireEvent.click(screen.getByText(/batch: all tabs → png/i));
        });

        await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
        const [message, severity] = notify.mock.calls[0];
        expect(message).toMatch(/render failed/i);
        expect(severity).toBe('error');
    });

    it('does not render its own Snackbar/Alert (feedback goes to the global Toaster)', async () => {
        const notify = vi.fn();
        useStructureStore.setState({ notify });
        vi.mocked(batchExport.batchExportPng).mockRejectedValueOnce(new Error('boom'));

        render(<ExportMenu />);
        fireEvent.click(screen.getByRole('button', { name: /export/i }));
        await act(async () => {
            fireEvent.click(screen.getByText(/batch: all tabs → png/i));
        });

        // The local toast Alert is gone; nothing with role="alert" is mounted by ExportMenu.
        await waitFor(() => expect(notify).toHaveBeenCalled());
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

describe('ExportMenu — exporting flag (C)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStructureStore.setState({
            structureData: makeDoc(),
            tabs: [],
            activeTabId: null,
            exporting: false,
        });
        // Add a tab so "Batch PNG" menu item is enabled.
        useStructureStore.getState().addTab(makeDoc(), 'tab1');
    });

    it('exporting is set to true during a batch PNG export and cleared in finally on success', async () => {
        let resolve!: () => void;
        const pending = new Promise<void>((res) => { resolve = res; });
        vi.mocked(batchExport.batchExportPng).mockReturnValueOnce(pending);

        render(<ExportMenu />);
        fireEvent.click(screen.getByRole('button', { name: /export/i }));
        fireEvent.click(screen.getByText(/batch: all tabs → png/i));

        // While the export is in-flight, exporting should be true.
        await waitFor(() => expect(useStructureStore.getState().exporting).toBe(true));

        // Resolve the export.
        await act(async () => { resolve(); });

        // After success, exporting should be cleared.
        await waitFor(() => expect(useStructureStore.getState().exporting).toBe(false));
    });

    it('exporting is cleared in finally even when the export rejects', async () => {
        let reject!: (e: Error) => void;
        const pending = new Promise<void>((_, rej) => { reject = rej; });
        vi.mocked(batchExport.batchExportPng).mockReturnValueOnce(pending);

        render(<ExportMenu />);
        fireEvent.click(screen.getByRole('button', { name: /export/i }));
        fireEvent.click(screen.getByText(/batch: all tabs → png/i));

        await waitFor(() => expect(useStructureStore.getState().exporting).toBe(true));

        await act(async () => { reject(new Error('render failed')); });

        await waitFor(() => expect(useStructureStore.getState().exporting).toBe(false));
    });
});
