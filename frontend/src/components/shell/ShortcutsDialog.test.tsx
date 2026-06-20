import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShortcutsDialog } from './ShortcutsDialog';

describe('ShortcutsDialog', () => {
  it('renders a dialog when open=true', () => {
    render(<ShortcutsDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render a dialog when open=false', () => {
    render(<ShortcutsDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the Undo shortcut row', () => {
    render(<ShortcutsDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/undo/i)).toBeInTheDocument();
  });

  it('shows the Previous frame shortcut row', () => {
    render(<ShortcutsDialog open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/previous frame/i)).toBeInTheDocument();
  });

  it('calls onClose when the Close button is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
