import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EmptyState } from './EmptyState';
import { useStructureStore } from '../../store/useStructureStore';

describe('EmptyState', () => {
  beforeEach(() => {
    useStructureStore.setState({ structureData: null });
  });

  it('shows the onboarding prompt when no structure is loaded', () => {
    render(<EmptyState onOpenFiles={vi.fn()} onLoadSample={vi.fn()} />);
    expect(screen.getByText(/drag & drop/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /load a sample/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /open file/i })).toBeVisible();
  });

  it('previews the post-load click-to-select interaction before anything is loaded', () => {
    render(<EmptyState onOpenFiles={vi.fn()} onLoadSample={vi.fn()} />);
    expect(screen.getByText(/click atoms to select/i)).toBeVisible();
    expect(screen.getByText(/press \? for shortcuts/i)).toBeVisible();
  });

  it('seats the onboarding text on an opaque surface so it stays legible on any background (BUG 4)', () => {
    // The overlay sits over the WebGL canvas as a transparent layer, and the
    // app's static dark MUI theme makes text.secondary near-white. Without an
    // opaque backdrop, the prompt is invisible after a light/custom background.
    // A MuiPaper surface (theme background.paper) always contrasts the text.
    render(<EmptyState onOpenFiles={vi.fn()} onLoadSample={vi.fn()} />);
    const panel = screen.getByTestId('empty-state-panel');
    expect(panel).toHaveClass('MuiPaper-root');
    // The legible text lives inside the surface, not on the bare transparent overlay.
    expect(panel).toContainElement(screen.getByText(/open a structure file/i));
  });

  it('renders nothing once a structure is loaded', () => {
    useStructureStore.setState({ structureData: { foo: 1 } as never });
    const { container } = render(<EmptyState onOpenFiles={vi.fn()} onLoadSample={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onLoadSample when the sample button is clicked', () => {
    const onLoadSample = vi.fn();
    render(<EmptyState onOpenFiles={vi.fn()} onLoadSample={onLoadSample} />);
    fireEvent.click(screen.getByRole('button', { name: /load a sample/i }));
    expect(onLoadSample).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenFiles with files dropped onto the dropzone', () => {
    const onOpenFiles = vi.fn();
    render(<EmptyState onOpenFiles={onOpenFiles} onLoadSample={vi.fn()} />);
    const file = new File(['3\nwater\nO 0 0 0'], 'water.xyz', { type: 'text/plain' });
    fireEvent.drop(screen.getByTestId('empty-state-dropzone'), {
      dataTransfer: { files: [file] },
    });
    expect(onOpenFiles).toHaveBeenCalledTimes(1);
    expect(onOpenFiles.mock.calls[0][0][0]).toBe(file);
  });

  it('calls onOpenFiles with the chosen file from the Open button input', () => {
    const onOpenFiles = vi.fn();
    render(<EmptyState onOpenFiles={onOpenFiles} onLoadSample={vi.fn()} />);
    const file = new File(['x'], 'a.xyz');
    fireEvent.change(screen.getByTestId('empty-state-file-input'), {
      target: { files: [file] },
    });
    expect(onOpenFiles).toHaveBeenCalledTimes(1);
    expect(onOpenFiles.mock.calls[0][0][0]).toBe(file);
  });

  it('reappears after the last tab is closed', () => {
    // Load a structure (overlay hidden), then close the last tab via the real
    // tabs slice — clearStructure nulls structureData and the overlay returns.
    const id = useStructureStore
      .getState()
      .addTab({ name: 'w', structure: { symbols: ['O'], positions: [[0, 0, 0]] } } as never, 'w');
    render(<EmptyState onOpenFiles={vi.fn()} onLoadSample={vi.fn()} />);
    expect(screen.queryByText(/drag & drop/i)).toBeNull();
    act(() => {
      useStructureStore.getState().closeTab(id);
    });
    expect(screen.getByText(/drag & drop/i)).toBeVisible();
  });
});
