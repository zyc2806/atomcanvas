import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TrajectoryBar } from './TrajectoryBar';
import { useStructureStore } from '../../store/useStructureStore';

const trajDoc = (frames: number) => ({
  structure: {
    symbols: ['O', 'H', 'H'],
    positions: [[0, 0, 0], [0.96, 0, 0], [-0.24, 0.93, 0]],
  },
  visualization: { bonds: [], h_bond_geometries: [], unwrapped_h_bonds: [], wrapped_ghost_bonds: [] },
  trajectory: Array.from({ length: frames }, (_, f) => ({
    symbols: ['O', 'H', 'H'],
    positions: [[f * 0.1, 0, 0], [0.96, 0, 0], [-0.24, 0.93, 0]],
  })),
}) as never;

const resetPlayback = () => useStructureStore.setState({
  structureData: null,
  currentFrame: 0,
  isPlaying: false,
  fps: 10,
});

describe('TrajectoryBar', () => {
  beforeEach(resetPlayback);

  it('renders nothing when there is no trajectory', () => {
    const { container } = render(<TrajectoryBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a single-frame trajectory', () => {
    useStructureStore.setState({ structureData: trajDoc(1) });
    const { container } = render(<TrajectoryBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders controls and the frame counter for a multi-frame trajectory', () => {
    useStructureStore.setState({ structureData: trajDoc(5) });
    render(<TrajectoryBar />);
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next frame/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous frame/i })).toBeInTheDocument();
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
  });

  it('labels the trajectory mode with the frame count and a playback hint', () => {
    useStructureStore.setState({ structureData: trajDoc(5) });
    render(<TrajectoryBar />);
    expect(screen.getByText(/Trajectory · 5 frames/i)).toBeInTheDocument();
    // Space/←→ playback hint is surfaced as a caption.
    expect(screen.getByText(/Space play · ← → step/i)).toBeInTheDocument();
  });

  it('clicking next advances the frame counter', () => {
    useStructureStore.setState({ structureData: trajDoc(5) });
    render(<TrajectoryBar />);
    fireEvent.click(screen.getByRole('button', { name: /next frame/i }));
    expect(useStructureStore.getState().currentFrame).toBe(1);
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('moving the slider updates currentFrame', () => {
    useStructureStore.setState({ structureData: trajDoc(5) });
    render(<TrajectoryBar />);
    fireEvent.change(screen.getByTestId('trajectory-frame-slider'), { target: { value: '3' } });
    expect(useStructureStore.getState().currentFrame).toBe(3);
  });

  it('stepping while playing pauses playback', () => {
    useStructureStore.setState({ structureData: trajDoc(5), isPlaying: true });
    render(<TrajectoryBar />);
    fireEvent.click(screen.getByRole('button', { name: /next frame/i }));
    expect(useStructureStore.getState().isPlaying).toBe(false);
    expect(useStructureStore.getState().currentFrame).toBe(1);
  });

  describe('playback with fake timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('clicking play advances the frame over time and stops at the last frame', () => {
      useStructureStore.setState({ structureData: trajDoc(3), fps: 10 });
      render(<TrajectoryBar />);

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /play/i }));
      });
      expect(useStructureStore.getState().isPlaying).toBe(true);

      // fps 10 => 100ms per frame. Advance to frame 1, then 2 (the last).
      act(() => { vi.advanceTimersByTime(100); });
      expect(useStructureStore.getState().currentFrame).toBe(1);
      act(() => { vi.advanceTimersByTime(100); });
      expect(useStructureStore.getState().currentFrame).toBe(2);

      // At the last frame the ticker must pause and never spin past the end.
      act(() => { vi.advanceTimersByTime(500); });
      expect(useStructureStore.getState().currentFrame).toBe(2);
      expect(useStructureStore.getState().isPlaying).toBe(false);
    });
  });

  it('does not pollute undo history while operating the controls', () => {
    useStructureStore.setState({ structureData: trajDoc(5), past: [], future: [] });
    render(<TrajectoryBar />);
    fireEvent.click(screen.getByRole('button', { name: /next frame/i }));
    fireEvent.change(screen.getByTestId('trajectory-frame-slider'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /first frame/i }));
    expect(useStructureStore.getState().past.length).toBe(0);
  });
});
