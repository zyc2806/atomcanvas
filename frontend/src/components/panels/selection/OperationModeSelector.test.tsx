import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OperationModeSelector } from './OperationModeSelector';
import { applyButtonLabel } from './applyButtonLabel';

// MUI's <Tooltip> copies its `title` onto the wrapped control as `aria-label`,
// so each ToggleButton's *accessible name* is the plain-English tooltip text,
// while its *visible* text stays the short label. We assert both: visible text
// via getByText, behaviour/tooltip via the accessible name.
describe('OperationModeSelector', () => {
  it('shows the four visible labels; the filter mode reads "Intersect", not "Filter"', () => {
    render(<OperationModeSelector value="replace" onChange={vi.fn()} />);
    expect(screen.getByText('Replace')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Intersect')).toBeInTheDocument();
    expect(screen.getByText('Exclude')).toBeInTheDocument();
    // The old set-logic label is gone from the visible UI.
    expect(screen.queryByText('Filter')).not.toBeInTheDocument();
  });

  it('attaches plain-English tooltips (exposed as accessible names) to every mode', () => {
    render(<OperationModeSelector value="replace" onChange={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Start a new selection (replace current)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add to current selection (union)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keep only atoms also in the current selection (intersect)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove these from the current selection' }),
    ).toBeInTheDocument();
  });

  it('still reports the internal "filter" id when the Intersect button is clicked', () => {
    const onChange = vi.fn();
    render(<OperationModeSelector value="replace" onChange={onChange} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep only atoms also in the current selection (intersect)' }),
    );
    expect(onChange).toHaveBeenCalledWith('filter');
  });
});

describe('applyButtonLabel', () => {
  it('keeps the plain "Apply" for replace so the default reads naturally', () => {
    expect(applyButtonLabel('replace')).toBe('Apply');
  });

  it('binds the Apply label to the active mode so the action is self-describing', () => {
    expect(applyButtonLabel('add')).toBe('Add to selection');
    expect(applyButtonLabel('filter')).toBe('Intersect');
    expect(applyButtonLabel('exclude')).toBe('Exclude');
  });
});
