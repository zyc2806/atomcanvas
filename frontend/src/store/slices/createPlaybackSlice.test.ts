import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

// A 5-frame trajectory (frame 0 carries a minimal visualization; later frames are
// positions-only, mirroring the real backend payload).
const trajDoc = (frames = 5) => ({
  structure: {
    symbols: ['O', 'H', 'H'],
    positions: [[0, 0, 0], [0.96, 0, 0], [-0.24, 0.93, 0]],
  },
  visualization: { bonds: [[0, 1, 1], [0, 2, 1]], h_bond_geometries: [], unwrapped_h_bonds: [], wrapped_ghost_bonds: [] },
  trajectory: Array.from({ length: frames }, (_, f) => ({
    symbols: ['O', 'H', 'H'],
    positions: [[f * 0.1, 0, 0], [0.96 + f * 0.1, 0, 0], [-0.24, 0.93, 0]],
  })),
}) as never;

const reset = () => useStructureStore.setState({
  structureData: null,
  currentFrame: 0,
  isPlaying: false,
  fps: 10,
  past: [],
  future: [],
});

describe('createPlaybackSlice', () => {
  beforeEach(reset);

  it('setCurrentFrame clamps to [0, len-1]', () => {
    useStructureStore.setState({ structureData: trajDoc(5) });
    const s = useStructureStore.getState();
    s.setCurrentFrame(2);
    expect(useStructureStore.getState().currentFrame).toBe(2);
    s.setCurrentFrame(99);
    expect(useStructureStore.getState().currentFrame).toBe(4); // len-1
    s.setCurrentFrame(-3);
    expect(useStructureStore.getState().currentFrame).toBe(0);
  });

  it('with no trajectory, setCurrentFrame collapses to 0', () => {
    // No structureData / no trajectory => frameCount 1 => only frame 0 is valid.
    useStructureStore.getState().setCurrentFrame(5);
    expect(useStructureStore.getState().currentFrame).toBe(0);
  });

  it('stepFrame clamps at both ends (no wrap)', () => {
    useStructureStore.setState({ structureData: trajDoc(3) });
    const s = useStructureStore.getState();
    s.stepFrame(1);
    expect(useStructureStore.getState().currentFrame).toBe(1);
    s.stepFrame(1);
    s.stepFrame(1); // would be 3, clamps to 2
    expect(useStructureStore.getState().currentFrame).toBe(2);
    s.stepFrame(-10); // clamps to 0
    expect(useStructureStore.getState().currentFrame).toBe(0);
    s.stepFrame(-1); // already 0, stays 0
    expect(useStructureStore.getState().currentFrame).toBe(0);
  });

  it('play / pause / togglePlay toggle isPlaying', () => {
    const s = useStructureStore.getState();
    s.play();
    expect(useStructureStore.getState().isPlaying).toBe(true);
    s.pause();
    expect(useStructureStore.getState().isPlaying).toBe(false);
    s.togglePlay();
    expect(useStructureStore.getState().isPlaying).toBe(true);
    s.togglePlay();
    expect(useStructureStore.getState().isPlaying).toBe(false);
  });

  it('setFps updates fps and floors at 1', () => {
    useStructureStore.getState().setFps(30);
    expect(useStructureStore.getState().fps).toBe(30);
    useStructureStore.getState().setFps(0);
    expect(useStructureStore.getState().fps).toBe(1);
  });

  it('resetPlayback returns to frame 0 and paused', () => {
    useStructureStore.setState({ structureData: trajDoc(5) });
    const s = useStructureStore.getState();
    s.setCurrentFrame(3);
    s.play();
    s.resetPlayback();
    const after = useStructureStore.getState();
    expect(after.currentFrame).toBe(0);
    expect(after.isPlaying).toBe(false);
  });

  // CRITICAL: playback is a viewing action — it must never grow the undo history.
  it('does NOT push undo history for any playback action', () => {
    useStructureStore.setState({ structureData: trajDoc(5) });
    expect(useStructureStore.getState().past.length).toBe(0);
    const s = useStructureStore.getState();
    s.setCurrentFrame(2);
    s.stepFrame(1);
    s.stepFrame(-1);
    s.play();
    s.pause();
    s.togglePlay();
    s.setFps(15);
    s.resetPlayback();
    expect(useStructureStore.getState().past.length).toBe(0);
    expect(useStructureStore.getState().future.length).toBe(0);
  });
});
