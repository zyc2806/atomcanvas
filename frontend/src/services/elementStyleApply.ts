import type { ElementStyle } from '../types/store';

export interface AtomOverrides {
  colorOverrides: { [i: number]: string };
  opacityOverrides: { [i: number]: number };
  radiusOverrides: { [i: number]: number };
}

export function elementStylesToAtomOverrides(
  symbols: string[],
  elements: Record<string, ElementStyle>,
): AtomOverrides {
  const colorOverrides: AtomOverrides['colorOverrides'] = {};
  const opacityOverrides: AtomOverrides['opacityOverrides'] = {};
  const radiusOverrides: AtomOverrides['radiusOverrides'] = {};
  symbols.forEach((sym, i) => {
    const st = elements[sym];
    if (!st) return;
    if (st.color !== undefined) colorOverrides[i] = st.color;
    if (st.opacity !== undefined) opacityOverrides[i] = st.opacity;
    if (st.radiusScale !== undefined) radiusOverrides[i] = st.radiusScale;
  });
  return { colorOverrides, opacityOverrides, radiusOverrides };
}
