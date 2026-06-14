import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OperationModeSelector } from './OperationModeSelector';

describe('OperationModeSelector', () => {
  it('renders the four modes and reports the clicked one', () => {
    const onChange = vi.fn();
    render(<OperationModeSelector value="replace" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(onChange).toHaveBeenCalledWith('filter');
  });
});
