import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopBar } from './TopBar';
import { useStructureStore } from '../../store/useStructureStore';

describe('TopBar', () => {
  it('renders readable text labels for each panel button', () => {
    render(<TopBar activePanel={null} onTogglePanel={vi.fn()} onOpenFiles={vi.fn()} />);
    expect(screen.getByText('Style')).toBeVisible();
    expect(screen.getByText('Bonds')).toBeVisible();
    expect(screen.getByText('Scene')).toBeVisible();
    expect(screen.getByText('Select')).toBeVisible();
  });

  it('renders the AtomCanvas wordmark', () => {
    render(<TopBar activePanel={null} onTogglePanel={vi.fn()} onOpenFiles={vi.fn()} />);
    expect(screen.getByText('AtomCanvas')).toBeVisible();
  });

  it('disables Undo and Redo when there is no history', () => {
    useStructureStore.setState({ past: [], future: [] });
    render(<TopBar activePanel={null} onTogglePanel={vi.fn()} onOpenFiles={vi.fn()} />);
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
  });

  it('enables Undo and fires the undo action when there is past history', () => {
    const undo = vi.fn();
    useStructureStore.setState({ undo, past: [{} as never], future: [] });
    render(<TopBar activePanel={null} onTogglePanel={vi.fn()} onOpenFiles={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /undo/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('enables Redo and fires the redo action when there is future history', () => {
    const redo = vi.fn();
    useStructureStore.setState({ redo, past: [], future: [{} as never] });
    render(<TopBar activePanel={null} onTogglePanel={vi.fn()} onOpenFiles={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /redo/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(redo).toHaveBeenCalledTimes(1);
  });
});
