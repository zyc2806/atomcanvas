/**
 * Pure helper computing the persistent atom-label set for the viewport.
 *
 * The "Atom labels" view control (viewControls.showLabels) had no render-side
 * reader, so toggling it did nothing. This helper resolves which labels to draw
 * (gated on showLabels) and their text — the element symbol plus a per-element
 * running index, e.g. ['O','H','H'] -> ['O1','H1','H2'] — mirroring the hover
 * tooltip's primary label. The AtomLabels component renders one sprite per entry.
 */

export interface AtomLabel {
  /** Stable React key (the atom's global index). */
  key: string;
  position: [number, number, number];
  /** Element symbol + per-element index, e.g. "C1". */
  text: string;
}

export function buildAtomLabels(
  symbols: string[],
  positions: readonly (readonly number[])[],
  showLabels: boolean,
): AtomLabel[] {
  if (!showLabels) return [];

  const counts: { [symbol: string]: number } = {};
  const labels: AtomLabel[] = [];
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const pos = positions[i];
    if (!pos || pos.length < 3) continue;
    counts[sym] = (counts[sym] || 0) + 1;
    labels.push({
      key: `label-${i}`,
      position: [pos[0], pos[1], pos[2]],
      text: `${sym}${counts[sym]}`,
    });
  }
  return labels;
}
