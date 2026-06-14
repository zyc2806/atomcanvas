import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TopBar } from './TopBar';

describe('TopBar', () => {
  it('renders readable text labels for each panel button', () => {
    render(<TopBar activePanel={null} onTogglePanel={vi.fn()} onOpenFiles={vi.fn()} />);
    expect(screen.getByText('Style')).toBeVisible();
    expect(screen.getByText('Bonds')).toBeVisible();
    expect(screen.getByText('Scene')).toBeVisible();
    expect(screen.getByText('Select')).toBeVisible();
  });
});
