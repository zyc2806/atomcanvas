import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { Toaster } from './Toaster';
import { useStructureStore } from '../../store/useStructureStore';

describe('Toaster', () => {
  beforeEach(() => useStructureStore.getState().clearNotification());

  it('shows the latest notification message', () => {
    render(<Toaster />);
    act(() => { useStructureStore.getState().notify('Selected 12 atoms', 'success'); });
    expect(screen.getByText('Selected 12 atoms')).toBeInTheDocument();
  });

  it('renders nothing when there is no notification', () => {
    render(<Toaster />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
