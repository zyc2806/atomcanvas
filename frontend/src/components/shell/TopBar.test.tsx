import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopBar } from './TopBar';
import { useStructureStore } from '../../store/useStructureStore';

const defaultProps = {
  activePanel: null as null,
  onTogglePanel: vi.fn(),
  onOpenFiles: vi.fn(),
  onOpenShortcuts: vi.fn(),
};

describe('TopBar', () => {
  it('renders readable text labels for each panel button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByText('Style')).toBeVisible();
    expect(screen.getByText('Bonds')).toBeVisible();
    expect(screen.getByText('Scene')).toBeVisible();
    expect(screen.getByText('Select')).toBeVisible();
  });

  it('renders the AtomCanvas wordmark', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByText('AtomCanvas')).toBeVisible();
  });

  it('disables Undo and Redo when there is no history', () => {
    useStructureStore.setState({ past: [], future: [] });
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
  });

  it('enables Undo and fires the undo action when there is past history', () => {
    const undo = vi.fn();
    useStructureStore.setState({ undo, past: [{} as never], future: [] });
    render(<TopBar {...defaultProps} />);
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('enables Redo and fires the redo action when there is future history', () => {
    const redo = vi.fn();
    useStructureStore.setState({ redo, past: [], future: [{} as never] });
    render(<TopBar {...defaultProps} />);
    const btn = screen.getByRole('button', { name: /redo/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('renders a keyboard shortcuts help button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /keyboard shortcuts/i })).toBeInTheDocument();
  });

  it('exposes a visible "Shortcuts" label on the help control (not a bare icon)', () => {
    render(<TopBar {...defaultProps} />);
    // The text label matches the panel-button treatment so the control is discoverable.
    expect(screen.getByText('Shortcuts')).toBeVisible();
    // And the visible label lives on the shortcuts control itself.
    expect(screen.getByRole('button', { name: /keyboard shortcuts/i })).toHaveTextContent('Shortcuts');
  });

  it('calls onOpenShortcuts when the keyboard shortcuts button is clicked', () => {
    const onOpenShortcuts = vi.fn();
    render(<TopBar {...defaultProps} onOpenShortcuts={onOpenShortcuts} />);
    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }));
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  describe('LinearProgress bar', () => {
    it('is absent when loading=false and exporting=false', () => {
      useStructureStore.setState({ loading: false, exporting: false });
      render(<TopBar {...defaultProps} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('shows a progressbar when loading=true', () => {
      useStructureStore.setState({ loading: true, exporting: false });
      render(<TopBar {...defaultProps} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows a progressbar when exporting=true', () => {
      useStructureStore.setState({ loading: false, exporting: true });
      render(<TopBar {...defaultProps} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows a progressbar when both loading and exporting are true', () => {
      useStructureStore.setState({ loading: true, exporting: true });
      render(<TopBar {...defaultProps} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });
});
