/**
 * Tests for Task 7: expanded autocomplete keywords + syntax legend.
 * Tests that:
 * 1. All new DSL keywords appear in the autocomplete options.
 * 2. The syntax help button is present.
 * 3. Clicking it opens the legend popover with GRAMMAR_ENTRIES content.
 * 4. No-drift: autocomplete options and legend both derive from the same
 *    EXPRESSION_KEYWORDS constant.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStructureStore } from '../../../store/useStructureStore';
import { EXPRESSION_KEYWORDS, GRAMMAR_ENTRIES } from './expressionSyntax';

vi.mock('../../../services/selectionService', () => ({
  selectionService: {
    parseExpression: vi.fn().mockResolvedValue({ indices: [] }),
    getAST: vi.fn().mockResolvedValue({ ast: null }),
    clearCache: vi.fn(),
  },
}));

import SelectionInput from './SelectionInput';

const doc = () =>
  ({ structure: { symbols: ['O', 'H'], positions: [[0, 0, 0], [1, 0, 0]] } }) as never;

describe('SelectionInput – expanded autocomplete keywords (Task 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().setSelectionExpression('');
  });

  /** Helper: open the autocomplete with a typed value and return the visible option labels */
  const getOptionsFor = (container: HTMLElement, typed: string): string[] => {
    const input = within(container).getByLabelText('Selection Expression');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: typed } });
    const options = document.querySelectorAll('[role="option"]');
    return Array.from(options).map(o => o.textContent ?? '');
  };

  it('includes frac: in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'frac');
    expect(labels.some(l => l.includes('frac:'))).toBe(true);
  });

  it('includes sphere: in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'sphere');
    expect(labels.some(l => l.includes('sphere:'))).toBe(true);
  });

  it('includes bonded: in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'bonded');
    expect(labels.some(l => l.includes('bonded:'))).toBe(true);
  });

  it('includes connected: in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'connected');
    expect(labels.some(l => l.includes('connected:'))).toBe(true);
  });

  it('includes pct: in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'pct');
    expect(labels.some(l => l.includes('pct:'))).toBe(true);
  });

  it('includes extend: in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'extend');
    expect(labels.some(l => l.includes('extend:'))).toBe(true);
  });

  it('includes fixed in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'fixed');
    expect(labels.some(l => l === 'fixed' || l.includes('fixed'))).toBe(true);
  });

  it('includes pin( in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'pin');
    expect(labels.some(l => l.includes('pin('))).toBe(true);
  });

  it('includes ids: in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'ids');
    expect(labels.some(l => l.includes('ids:'))).toBe(true);
  });

  it('includes label: in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, 'label');
    expect(labels.some(l => l.includes('label:'))).toBe(true);
  });

  it('includes * in the autocomplete options', () => {
    const { container } = render(<SelectionInput />);
    const labels = getOptionsFor(container, '*');
    expect(labels.some(l => l === '*' || l.includes('*'))).toBe(true);
  });

  it('syntax help button is present in the DOM', () => {
    render(<SelectionInput />);
    const helpBtn = screen.getByRole('button', { name: /syntax help/i });
    expect(helpBtn).toBeInTheDocument();
  });

  it('clicking syntax help button opens the legend popover with first grammar entry', () => {
    render(<SelectionInput />);
    const helpBtn = screen.getByRole('button', { name: /syntax help/i });
    fireEvent.click(helpBtn);
    // After opening, the first grammar entry label should appear in the document
    expect(GRAMMAR_ENTRIES.length).toBeGreaterThan(0);
    const firstEntry = GRAMMAR_ENTRIES[0];
    expect(screen.getByText(firstEntry.label)).toBeInTheDocument();
  });

  it('legend popover shows all GRAMMAR_ENTRIES labels', () => {
    render(<SelectionInput />);
    fireEvent.click(screen.getByRole('button', { name: /syntax help/i }));
    for (const entry of GRAMMAR_ENTRIES) {
      expect(screen.getByText(entry.label)).toBeInTheDocument();
    }
  });

  /**
   * No-drift test (structural): EVERY token in EXPRESSION_KEYWORDS — including
   * logic operators (AND/OR/NOT) and parentheses — must be represented somewhere
   * in GRAMMAR_ENTRIES.  A token is "covered" if:
   *   - its exact string appears as a GRAMMAR_ENTRIES label, OR
   *   - it is contained within a combined label (e.g. "AND / OR / NOT" covers AND).
   *
   * Deleting any keyword's legend coverage must make this test FAIL.
   */
  it('no-drift: EVERY EXPRESSION_KEYWORD is covered in GRAMMAR_ENTRIES', () => {
    const entryLabels = GRAMMAR_ENTRIES.map(e => e.label);
    for (const kw of EXPRESSION_KEYWORDS) {
      const covered = entryLabels.some(l => l === kw || l.includes(kw));
      expect(covered, `GRAMMAR_ENTRIES must cover keyword "${kw}" — add it to MERGED_GROUPS or as an individual row`).toBe(true);
    }
  });

  it('no-drift: EXPRESSION_KEYWORDS module is the source for both autocomplete options and legend', () => {
    // This test verifies the module-level contract: the component must import and
    // use EXPRESSION_KEYWORDS. We verify this by checking that the keywords we
    // know are new appear in the rendered autocomplete (via filtered input) AND
    // in the legend (opened via help button). If they drift, one would be missing.
    const { container } = render(<SelectionInput />);

    // Check autocomplete has sphere: (a new keyword)
    const sphereLabels = getOptionsFor(container, 'sphere');
    expect(sphereLabels.some(l => l.includes('sphere:'))).toBe(true);

    // Blur the input to close the options listbox before opening the help popover
    const input = within(container).getByLabelText('Selection Expression');
    fireEvent.blur(input);

    // Check legend also has sphere: (may appear in multiple elements if options still in DOM,
    // so use getAllByText and assert at least one exists)
    fireEvent.click(screen.getByRole('button', { name: /syntax help/i }));
    const sphereEls = screen.getAllByText('sphere:');
    expect(sphereEls.length).toBeGreaterThan(0);
  });
});
