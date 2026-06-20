import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ViewportHint } from './ViewportHint';
import { useStructureStore } from '../../store/useStructureStore';

const fakeDoc = () => ({ structure: { symbols: ['O'], positions: [[0, 0, 0]] } }) as never;

describe('ViewportHint', () => {
  beforeEach(() => {
    localStorage.clear();
    useStructureStore.setState({ structureData: null });
  });

  it('renders nothing when no structure is loaded', () => {
    render(<ViewportHint />);
    expect(screen.queryByTestId('viewport-hint')).not.toBeInTheDocument();
  });

  it('shows the click-to-select caption once a structure is loaded', () => {
    useStructureStore.setState({ structureData: fakeDoc() });
    render(<ViewportHint />);
    expect(screen.getByText(/click an atom to select/i)).toBeInTheDocument();
  });

  it('hides on dismiss and persists the dismissal so it never returns', () => {
    useStructureStore.setState({ structureData: fakeDoc() });
    const { unmount } = render(<ViewportHint />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss hint/i }));
    expect(screen.queryByTestId('viewport-hint')).not.toBeInTheDocument();

    // A fresh mount (e.g. reload) must stay hidden — the flag is persisted.
    unmount();
    render(<ViewportHint />);
    expect(screen.queryByTestId('viewport-hint')).not.toBeInTheDocument();
  });
});
