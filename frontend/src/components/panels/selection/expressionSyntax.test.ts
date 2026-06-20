/**
 * Tests for expressionSyntax shared constant module.
 * Verifies that the module exports the expected shape and includes
 * all DSL keywords from SelectorKind.
 */
import { describe, it, expect } from 'vitest';
import {
  EXPRESSION_KEYWORDS,
  KEYWORD_DESCRIPTIONS,
  GRAMMAR_ENTRIES,
} from './expressionSyntax';

describe('expressionSyntax shared constants', () => {
  it('exports EXPRESSION_KEYWORDS as a non-empty array', () => {
    expect(Array.isArray(EXPRESSION_KEYWORDS)).toBe(true);
    expect(EXPRESSION_KEYWORDS.length).toBeGreaterThan(0);
  });

  it('EXPRESSION_KEYWORDS includes all DSL selector prefixes', () => {
    const required = [
      'elem:', 'pos:', 'slab:', 'frac:', 'sphere:', 'bonded:', 'connected:',
      'pct:', 'extend:', 'fixed', 'pin(', 'ids:', 'label:', '*',
    ];
    for (const kw of required) {
      expect(EXPRESSION_KEYWORDS).toContain(kw);
    }
  });

  it('EXPRESSION_KEYWORDS includes logic operators', () => {
    expect(EXPRESSION_KEYWORDS).toContain('AND');
    expect(EXPRESSION_KEYWORDS).toContain('OR');
    expect(EXPRESSION_KEYWORDS).toContain('NOT');
  });

  it('EXPRESSION_KEYWORDS includes parentheses', () => {
    expect(EXPRESSION_KEYWORDS).toContain('(');
    expect(EXPRESSION_KEYWORDS).toContain(')');
  });

  it('exports KEYWORD_DESCRIPTIONS as a record covering all EXPRESSION_KEYWORDS', () => {
    expect(typeof KEYWORD_DESCRIPTIONS).toBe('object');
    for (const kw of EXPRESSION_KEYWORDS) {
      expect(KEYWORD_DESCRIPTIONS).toHaveProperty(kw);
      expect(typeof KEYWORD_DESCRIPTIONS[kw]).toBe('string');
      expect(KEYWORD_DESCRIPTIONS[kw].length).toBeGreaterThan(0);
    }
  });

  it('exports GRAMMAR_ENTRIES as a non-empty array with label+description', () => {
    expect(Array.isArray(GRAMMAR_ENTRIES)).toBe(true);
    expect(GRAMMAR_ENTRIES.length).toBeGreaterThan(0);
    for (const entry of GRAMMAR_ENTRIES) {
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.description).toBe('string');
    }
  });
});
