/**
 * Single source of truth for the Expression DSL keyword set and descriptions.
 *
 * Both the autocomplete (SelectionInput.tsx) and the syntax legend derive from
 * this module so they cannot drift apart.
 *
 * SelectorKind authoritative reference:
 *   types/selection.ts → SelectorKind =
 *     'all' | 'elem' | 'label' | 'pos' | 'frac' | 'slab' | 'sphere' |
 *     'bonded' | 'connected' | 'pct' | 'extend' | 'fixed' | 'ids' | 'pin'
 */

/** All autocomplete keywords for the Expression DSL (static; no element options). */
export const EXPRESSION_KEYWORDS: readonly string[] = [
  // Selector prefixes
  'elem:',
  'label:',
  'pos:',
  'frac:',
  'slab:',
  'sphere:',
  'bonded:',
  'connected:',
  'pct:',
  'extend:',
  'ids:',
  // Value-only selectors
  'fixed',
  'pin(',
  '*',
  // Logic operators
  'AND',
  'OR',
  'NOT',
  // Grouping
  '(',
  ')',
];

/**
 * Human-readable description for each autocomplete keyword.
 * Every key in EXPRESSION_KEYWORDS must appear here.
 */
export const KEYWORD_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'elem:': 'Element symbol — e.g. elem:C selects all carbon atoms',
  'label:': 'Atom index or label — e.g. label:0,1,2 or label:C1',
  'pos:': 'Cartesian coordinate filter — e.g. pos:z>5.0',
  'frac:': 'Fractional coordinate filter — e.g. frac:z>0.5',
  'slab:': 'Layer by slab analysis — e.g. slab:z@2 (layer index)',
  'sphere:': 'Sphere selection — e.g. sphere:@0;3.5 (atom 0, radius 3.5 Å)',
  'bonded:': 'Atoms directly bonded to a target — e.g. bonded:@0',
  'connected:': 'Entire fragment connected to a target — e.g. connected:@0',
  'pct:': 'Percentile filter along an axis — e.g. pct:z;0;50 (bottom 50%)',
  'extend:': 'Grow selection N bond hops outward — e.g. extend:@0;2',
  'ids:': 'Explicit atom indices — e.g. ids:0,1,5',
  'fixed': 'Atoms frozen in place (FixAtoms constraint)',
  'pin(': 'Pin a sub-expression so it stays fixed during editing — e.g. pin(elem:C)',
  '*': 'All atoms in the structure',
  'AND': 'Logical AND — both conditions must be true',
  'OR': 'Logical OR — either condition may be true',
  'NOT': 'Logical NOT — negate a condition',
  '(': 'Open grouping parenthesis',
  ')': 'Close grouping parenthesis',
};

/** Grammar-level entries shown in the syntax legend (extends keyword descriptions). */
export interface GrammarEntry {
  label: string;
  description: string;
}

/**
 * Tokens that are merged into a single combined legend row (for readability).
 * Each set is displayed as "A / B / C" with a combined description.
 * Keys must all exist in KEYWORD_DESCRIPTIONS; they are removed from individual rows.
 */
const MERGED_GROUPS: Array<{ tokens: string[]; combinedLabel: string; combinedDescription: string }> = [
  {
    tokens: ['AND', 'OR', 'NOT'],
    combinedLabel: 'AND / OR / NOT',
    combinedDescription: 'Boolean logic — combine or negate selectors',
  },
  {
    tokens: ['(', ')'],
    combinedLabel: '( )',
    combinedDescription: 'Grouping parentheses — control evaluation order, e.g. (elem:C OR elem:N)',
  },
];

/**
 * Build GRAMMAR_ENTRIES programmatically so that every token in EXPRESSION_KEYWORDS
 * is automatically represented in the legend.  Adding a new keyword to
 * EXPRESSION_KEYWORDS (and its description to KEYWORD_DESCRIPTIONS) is sufficient —
 * no manual legend update is needed.
 *
 * Algorithm (single pass over EXPRESSION_KEYWORDS):
 *   1. For each keyword, check whether it belongs to a MERGED_GROUPS entry.
 *      - If yes and this is the first time that group is seen, emit one combined
 *        row for the whole group at that position; skip individual rows for all
 *        other tokens in the same group.
 *      - If no, emit one individual row using KEYWORD_DESCRIPTIONS.
 *   2. After the pass, append grammar-convention rows (e.g. @index, ;hops, ,)
 *      that are not tied to any autocomplete keyword.
 */
function buildGrammarEntries(): readonly GrammarEntry[] {
  const entries: GrammarEntry[] = [];

  // 1. Individual keyword rows (preserving EXPRESSION_KEYWORDS order), injecting
  //    merged-group rows at the position of their first token.
  const emittedGroups = new Set<number>();
  for (const kw of EXPRESSION_KEYWORDS) {
    const groupIdx = MERGED_GROUPS.findIndex(g => g.tokens.includes(kw));
    if (groupIdx !== -1) {
      if (!emittedGroups.has(groupIdx)) {
        emittedGroups.add(groupIdx);
        const g = MERGED_GROUPS[groupIdx];
        entries.push({ label: g.combinedLabel, description: g.combinedDescription });
      }
      // Skip individual row for merged tokens
      continue;
    }
    // Safety: every non-merged keyword must have a description
    const desc = KEYWORD_DESCRIPTIONS[kw];
    if (desc === undefined) {
      throw new Error(`expressionSyntax: missing KEYWORD_DESCRIPTIONS entry for "${kw}"`);
    }
    entries.push({ label: kw, description: desc });
  }

  // 2. Grammar-convention rows (not derived from EXPRESSION_KEYWORDS)
  entries.push(
    { label: '@index', description: 'Target atom by zero-based index — e.g. @0, @3' },
    { label: ';hops', description: 'Number of bond hops — e.g. extend:@0;2 means 2 hops out' },
    { label: ',', description: 'Comma — separates multiple values or targets, e.g. ids:0,1,5' },
  );

  return entries;
}

export const GRAMMAR_ENTRIES: readonly GrammarEntry[] = buildGrammarEntries();
