import type { StandardStructureObject } from '../types/store';

/**
 * Pure selector for the positions rendered at a given trajectory frame.
 *
 * For a SINGLE structure (no trajectory, or length <= 1) returns `null`, which
 * the caller treats as "render structureData as-is" — including the wrapped
 * (in-cell) display basis and the secondary geometry (ghost stubs, rings,
 * h-bonds).
 *
 * For a MULTI-FRAME trajectory it returns that frame's RAW positions for EVERY
 * frame INCLUDING frame 0 (clamped to a valid index). This keeps the whole
 * trajectory in one continuous (raw) coordinate basis: rendering frame 0 in the
 * wrapped basis while frames >= 1 are raw would teleport out-of-cell atoms by a
 * full lattice vector at the 0↔1 boundary. The caller threads the result into
 * <Atoms customPositions> / <Bonds customPositions> with the frame-0 bond
 * topology, and gates the (wrapped-basis) secondary geometry off while a
 * trajectory is active.
 */
export function selectFramePositions(
    structureData: StandardStructureObject | null | undefined,
    currentFrame: number,
): [number, number, number][] | null {
    if (!structureData) return null;
    const traj = structureData.trajectory;
    if (!traj || traj.length <= 1) return null;
    const idx = Math.max(0, Math.min(currentFrame, traj.length - 1));
    return traj[idx].positions;
}
