/**
 * displayPositions.ts
 *
 * The coordinate basis used to DRAW a structure (atoms + regular bonds). For
 * periodic structures this is the wrapped (in-cell) basis so atoms, regular
 * bonds, and cross-boundary ghost-bond stubs all line up — no bonds spanning the
 * whole unit cell. The canonical `structure.positions` stays RAW (the source of
 * truth for export, edits, and the translate(wrap=false) toggle); only the
 * display reads the wrapped basis.
 *
 * For non-periodic structures the backend sets wrapped_positions === positions,
 * so this is visually a no-op. Falls back to raw positions if wrapped_positions
 * is missing or a length mismatch (defensive against malformed/legacy data).
 *
 * NOTE: trajectory playback passes its own per-frame (raw, continuous) positions
 * directly and must NOT go through here, so atoms don't teleport across PBC
 * boundaries between frames.
 */
export function displayPositions(structure: {
    positions: [number, number, number][];
    wrapped_positions?: [number, number, number][];
}): [number, number, number][] {
    const wrapped = structure.wrapped_positions;
    if (wrapped && wrapped.length === structure.positions.length) return wrapped;
    return structure.positions;
}
