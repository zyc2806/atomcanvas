// SelectionExpressionTree.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SelectionExpressionTree from './SelectionExpressionTree';
import type { ASTNode } from '../../../types/selection';

describe('SelectionExpressionTree', () => {
  it('renders a logic node with its operands', () => {
    const ast: ASTNode = {
      type: 'logic',
      operator: 'AND',
      operands: [
        { type: 'selector', kind: 'elem', value: 'C', span: [0, 6] },
        { type: 'selector', kind: 'pos', value: 'z>10', span: [11, 19] },
      ],
      span: [0, 19],
    } as unknown as ASTNode;
    render(<SelectionExpressionTree ast={ast} onNodeDoubleClick={vi.fn()} />);
    expect(screen.getByText(/AND/i)).toBeInTheDocument();
  });

  it('renders nothing when ast is null', () => {
    const { container } = render(
      <SelectionExpressionTree ast={null} onNodeDoubleClick={vi.fn()} />,
    );
    expect(container.textContent ?? '').not.toContain('AND');
  });
});
