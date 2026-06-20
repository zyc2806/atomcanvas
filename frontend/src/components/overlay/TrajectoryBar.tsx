import { useEffect } from 'react';
import { Paper, Stack, IconButton, Tooltip, Slider, Typography, Select, MenuItem } from '@mui/material';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import useStructureStore from '../../store/useStructureStore';

const FPS_OPTIONS = [1, 5, 10, 15, 30];

/**
 * Bottom-centered transport bar for stepping / playing back an already-loaded
 * multi-frame trajectory. Self-hides for single-frame structures. Frame swapping
 * happens in SceneContent via the customPositions render path; this component only
 * drives the playback slice (no backend calls, no undo-history mutation).
 */
export function TrajectoryBar() {
  const frameCount = useStructureStore((s) => s.structureData?.trajectory?.length ?? 0);
  const currentFrame = useStructureStore((s) => s.currentFrame);
  const isPlaying = useStructureStore((s) => s.isPlaying);
  const fps = useStructureStore((s) => s.fps);
  const setCurrentFrame = useStructureStore((s) => s.setCurrentFrame);
  const stepFrame = useStructureStore((s) => s.stepFrame);
  const togglePlay = useStructureStore((s) => s.togglePlay);
  const pause = useStructureStore((s) => s.pause);
  const setFps = useStructureStore((s) => s.setFps);
  const resetPlayback = useStructureStore((s) => s.resetPlayback);

  // Animation ticker: while playing, advance one frame every 1000/fps ms. Stops
  // (pauses) when it reaches the last frame so it never spins past the end. Reads
  // the live frame count / index from the store at tick time so the closure can't
  // go stale. Re-created whenever play state or fps changes; cleaned up on unmount.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const s = useStructureStore.getState();
      const last = (s.structureData?.trajectory?.length ?? 1) - 1;
      if (s.currentFrame >= last) {
        s.pause();
        return;
      }
      s.stepFrame(1);
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [isPlaying, fps]);

  // Self-hide unless there is a real (>1 frame) trajectory to play.
  if (frameCount <= 1) return null;

  // Step / scrub gestures pause playback so the user takes control of the timeline.
  const stepAndPause = (delta: number) => {
    if (isPlaying) pause();
    stepFrame(delta);
  };
  const scrubTo = (i: number) => {
    if (isPlaying) pause();
    setCurrentFrame(i);
  };

  return (
    <Paper
      elevation={6}
      sx={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        px: 2,
        py: 1,
        borderRadius: 3,
        zIndex: 5,
        minWidth: 420,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Tooltip title="Space = play / pause · ← → = step frames">
          <Stack spacing={0} sx={{ pr: 0.5, whiteSpace: 'nowrap', cursor: 'default' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              Trajectory · {frameCount} frames
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              Space play · ← → step
            </Typography>
          </Stack>
        </Tooltip>
        <Tooltip title="First frame">
          <IconButton size="small" aria-label="first frame" onClick={() => resetPlayback()}>
            <SkipPreviousIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Previous frame">
          <IconButton size="small" aria-label="previous frame" onClick={() => stepAndPause(-1)}>
            <NavigateBeforeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
          <IconButton size="small" aria-label={isPlaying ? 'pause' : 'play'} onClick={() => togglePlay()}>
            {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Next frame">
          <IconButton size="small" aria-label="next frame" onClick={() => stepAndPause(1)}>
            <NavigateNextIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Slider
          size="small"
          min={0}
          max={frameCount - 1}
          value={currentFrame}
          onChange={(_, v) => scrubTo(Array.isArray(v) ? v[0] : v)}
          aria-label="trajectory frame"
          slotProps={{ input: { 'data-testid': 'trajectory-frame-slider' } as never }}
          sx={{ flex: 1, minWidth: 140 }}
        />

        <Typography variant="caption" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {currentFrame + 1} / {frameCount}
        </Typography>

        <Select
          size="small"
          value={fps}
          onChange={(e) => setFps(Number(e.target.value))}
          inputProps={{ 'aria-label': 'frames per second' }}
          sx={{ fontSize: '0.75rem' }}
        >
          {FPS_OPTIONS.map((f) => (
            <MenuItem key={f} value={f} sx={{ fontSize: '0.75rem' }}>{f} fps</MenuItem>
          ))}
        </Select>
      </Stack>
    </Paper>
  );
}

export default TrajectoryBar;
