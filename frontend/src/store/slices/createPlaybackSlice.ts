import type { StateCreator } from 'zustand';
import type { PlaybackSlice, StructureState } from '../../types/store';

/**
 * Trajectory playback state. This is a pure VIEWING feature: it swaps which
 * already-loaded frame is rendered. It NEVER calls pushHistory / updateStructure
 * and never touches structureData, so scrubbing through frames cannot pollute the
 * undo stack or be mistaken for an edit. Frame indices are clamped against the
 * active structure's trajectory length so an index from one structure can't point
 * past the end of a shorter trajectory.
 */

// Number of frames in the active trajectory. A structure with no trajectory (or a
// single-frame one) has frameCount 1, so every clamp collapses to [0, 0].
const frameCount = (state: StructureState): number =>
    state.structureData?.trajectory?.length ?? 1;

const clampFrame = (i: number, count: number): number =>
    Math.max(0, Math.min(count - 1, i));

export const createPlaybackSlice: StateCreator<StructureState, [], [], PlaybackSlice> = (set) => ({
    currentFrame: 0,
    isPlaying: false,
    fps: 10,

    setCurrentFrame: (i) =>
        set((state) => ({ currentFrame: clampFrame(i, frameCount(state)) })),

    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

    stepFrame: (delta) =>
        set((state) => ({ currentFrame: clampFrame(state.currentFrame + delta, frameCount(state)) })),

    setFps: (fps) => set({ fps: Math.max(1, fps) }),

    resetPlayback: () => set({ currentFrame: 0, isPlaying: false }),
});
