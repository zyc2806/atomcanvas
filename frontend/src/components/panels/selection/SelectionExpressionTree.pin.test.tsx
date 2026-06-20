/**
 * Tests for Task 7: pin affordance on tree nodes.
 * Verifies that:
 * 1. A Tooltip with "Double-click to pin/unpin" is present on tree nodes.
 * 2. The existing onNodeDoubleClick callback is still called on double-click.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SelectionExpressionTree from './SelectionExpressionTree';
import type { ASTNode } from '../../../types/selection';

const makeSimpleAst = (): ASTNode =>
  ({
    type: 'selector',
    kind: 'elem',
    values: ['C'],
    span: [0, 6],
  }) as unknown as ASTNode;

const makeLogicAst = (): ASTNode =>
  ({
    type: 'logic',
    operator: 'AND',
    operands: [
      { type: 'selector', kind: 'elem', value: 'C', span: [0, 6] },
      { type: 'selector', kind: 'pos', value: 'z>10', span: [11, 19] },
    ],
    span: [0, 19],
  }) as unknown as ASTNode;

describe('SelectionExpressionTree – pin affordance (Task 7)', () => {
  it('chip node has aria-label / tooltip advertising pin gesture', () => {
    render(<SelectionExpressionTree ast={makeSimpleAst()} onNodeDoubleClick={vi.fn()} />);
    // The chip should carry the tooltip title "Double-click to pin/unpin" as its aria-label
    const chip = screen.getByRole('button', { name: /double-click to pin/i });
    expect(chip).toBeInTheDocument();
  });

  it('double-clicking a chip still invokes onNodeDoubleClick', () => {
    const handler = vi.fn();
    render(<SelectionExpressionTree ast={makeSimpleAst()} onNodeDoubleClick={handler} />);
    const chip = screen.getByRole('button', { name: /double-click to pin/i });
    fireEvent.doubleClick(chip);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('logic node chip also has pin affordance', () => {
    render(<SelectionExpressionTree ast={makeLogicAst()} onNodeDoubleClick={vi.fn()} />);
    // All node chips should have the pin affordance
    const chips = screen.getAllByRole('button', { name: /double-click to pin/i });
    // Expect at least one chip with the pin aria-label (for leaf nodes; logic root too)
    expect(chips.length).toBeGreaterThan(0);
  });

  it('onNodeDoubleClick is called with the node that was double-clicked', () => {
    const handler = vi.fn();
    render(<SelectionExpressionTree ast={makeSimpleAst()} onNodeDoubleClick={handler} />);
    const chip = screen.getByRole('button', { name: /double-click to pin/i });
    fireEvent.doubleClick(chip);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'selector', kind: 'elem' })
    );
  });
});
