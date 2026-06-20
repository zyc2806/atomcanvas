import type { StandardStructureObject } from '../types/store';

/**
 * Pure selector for the positions rendered at a given trajectory frame.
 *
 * Frame 0 (or any out-of-range / missing-trajectory case) returns `null`, which
 * the caller treats as "render structureData as-is" (full topology, secondary
 * geometry). For a valid non-zero frame it returns that frame's positions, which
 * the caller threads into <Atoms customPositions> / <Bonds customPositions> so the
 * scene shows the moved atoms while reusing the frame-0 bond topology.
 *
 * Returning null (rather than frame-0 positions) keeps the frame-0 render path
 * byte-for-byte unchanged and lets the caller cheaply branch on it.
 */
export function selectFramePositions(
    structureData: StandardStructureObject | null | undefined,
    currentFrame: number,
): [number, number, number][] | null {
    if (!structureData) return null;
    const traj = structureData.trajectory;
    if (!traj || traj.length <= 1) return null;
    if (currentFrame <= 0 || currentFrame >= traj.length) return null;
    return traj[currentFrame].positions;
}
