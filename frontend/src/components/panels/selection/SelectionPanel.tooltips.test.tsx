/**
 * Task 5 TDD tests — chip tooltips + inline captions for SelectionPanel.
 *
 * RED phase: these tests must FAIL before the implementation is added.
 *
 * Tests assert:
 *  1. Each of the 10 method chips is still accessible by its visible label name
 *     (getByRole('button', {name}) — the span wrapper must NOT break this).
 *  2. Each chip's wrapping <span> carries the tooltip hint as aria-label.
 *  3. Inline methods Element, Label, Position, Layers each show a caption below
 *     the form controls.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SelectionPanel from './SelectionPanel';
import { useStructureStore } from '../../../store/useStructureStore';

vi.mock('../../../services/selectionService', () => ({
  selectionService: {
    parseLabels: vi.fn(),
    filterPosition: vi.fn(),
    analyzeClusters: vi.fn(),
    parseExpression: vi.fn(),
    clearCache: vi.fn(),
  },
}));

const doc = () =>
  ({ structure: { symbols: ['O', 'H', 'H'], positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }) as never;

// All 10 method chips with their expected tooltip hints
const CHIP_HINTS: [string, string][] = [
  ['Element',    'Select all atoms of a chemical element'],
  ['Label',      'Select by atom index/label'],
  ['Position',   'Select by a coordinate threshold'],
  ['Layers',     'Divide the cell into N layers along an axis and pick a layer'],
  ['Sphere',     'Select atoms within a radius of a point/atom'],
  ['Bonded',     'Atoms directly bonded to the selected atom'],
  ['Percentile', 'Atoms in the top/bottom % along an axis'],
  ['Extend',     'Grow the current selection N bonds outward'],
  ['Fixed',      'Atoms frozen in place (FixAtoms constraint)'],
  ['Connected',  'The whole fragment touching this atom'],
];

describe('SelectionPanel — Task 5: chip tooltips + inline captions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
    useStructureStore.getState().addTab(doc(), 'w');
    useStructureStore.getState().clearSelection();
    useStructureStore.getState().clearNotification?.();
  });

  describe('chip accessible names are preserved via span wrapper', () => {
    it('all 10 chip buttons are still reachable by their visible label via getByRole', () => {
      render(<SelectionPanel />);
      CHIP_HINTS.forEach(([label]) => {
        // The chip must still be a button with the visible label as its accessible name.
        // The span wrapper should carry the aria-label, NOT the chip itself.
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      });
    });
  });

  describe('each chip wrapper span carries the tooltip hint as aria-label', () => {
    CHIP_HINTS.forEach(([label, hint]) => {
      it(`"${label}" chip wrapper carries aria-label="${hint}"`, () => {
        render(<SelectionPanel />);
        // The <span> wrapping each Chip should have the hint as aria-label
        // (MUI Tooltip injects title onto its immediate child).
        const span = document.querySelector(`[aria-label="${hint}"]`);
        expect(span).not.toBeNull();
      });
    });
  });

  describe('inline method captions are rendered', () => {
    it('Element method shows a format/example caption (not a hint echo)', () => {
      render(<SelectionPanel />);
      // Caption must mention "element symbol" and give an example, not echo the chip hint.
      const captions = screen.getAllByText(/element symbol.*e\.g\./i);
      expect(captions.length).toBeGreaterThan(0);
    });

    it('Label method shows a format/example caption describing accepted input', () => {
      render(<SelectionPanel />);
      fireEvent.click(screen.getByRole('button', { name: 'Label' }));
      // Caption must mention indices/ranges with a concrete example.
      const captions = screen.getAllByText(/atom indices.*e\.g\./i);
      expect(captions.length).toBeGreaterThan(0);
    });

    it('Position method shows a caption mentioning both coordinate systems', () => {
      render(<SelectionPanel />);
      fireEvent.click(screen.getByRole('button', { name: 'Position' }));
      // Caption must mention both Cartesian and fractional plus an example expression.
      const captions = screen.getAllByText(/cartesian.*fractional|fractional.*cartesian/i);
      expect(captions.length).toBeGreaterThan(0);
    });

    it('Layers method does NOT show a redundant standalone caption (steps cover it)', () => {
      render(<SelectionPanel />);
      fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
      // The three numbered steps + chip tooltip already explain the flow.
      // There must NOT be an additional standalone hint that just echoes the chip hint.
      expect(screen.queryByText(/divide the cell into N layers along an axis and pick a layer/i)).not.toBeInTheDocument();
    });
  });
});
