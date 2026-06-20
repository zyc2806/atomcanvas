// SelectionExpressionTree.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SelectionExpressionTree from './SelectionExpressionTree';
import type { ASTNode } from '../../../types/selection';

const makeAst = (): ASTNode =>
  ({
    type: 'logic',
    operator: 'AND',
    operands: [
      { type: 'selector', kind: 'elem', value: 'C', span: [0, 6] },
      { type: 'selector', kind: 'pos', value: 'z>10', span: [11, 19] },
    ],
    span: [0, 19],
  }) as unknown as ASTNode;

describe('SelectionExpressionTree', () => {
  it('renders a logic node with its operands', () => {
    render(<SelectionExpressionTree ast={makeAst()} onNodeDoubleClick={vi.fn()} />);
    expect(screen.getByText(/AND/i)).toBeInTheDocument();
  });

  it('renders nothing when ast is null', () => {
    const { container } = render(
      <SelectionExpressionTree ast={null} onNodeDoubleClick={vi.fn()} />,
    );
    expect(container.textContent ?? '').not.toContain('AND');
  });

  it('expand/collapse button has an accessible name', () => {
    render(<SelectionExpressionTree ast={makeAst()} onNodeDoubleClick={vi.fn()} />);
    // Initially expanded — the button should say "Collapse node"
    expect(screen.getByRole('button', { name: /collapse node/i })).toBeInTheDocument();
  });

  it('expand/collapse button aria-label flips after clicking', () => {
    render(<SelectionExpressionTree ast={makeAst()} onNodeDoubleClick={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /collapse node/i });
    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: /expand node/i })).toBeInTheDocument();
  });
});
