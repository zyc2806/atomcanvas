import { useEffect, useMemo, useRef } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useStructureStore } from '../../store/useStructureStore';
import { refreshTopology } from '../../services/topologyRefresh';
import type { CartoonParams } from '../../types/store';

type Vec3 = [number, number, number];

// Cartoon (toon-shaded) render style exposes four tunable parameters. Ranges
// mirror the parent ase-view ViewOptionsPanel so behaviour matches the renderer.
const CARTOON_SLIDERS: {
  key: keyof CartoonParams;
  label: string;
  testId: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: 'outlineThickness', label: 'Outline thickness', testId: 'outline-thickness', min: 0.5, max: 8, step: 0.1 },
  { key: 'highlightThreshold', label: 'Highlight threshold', testId: 'highlight-threshold', min: 0.5, max: 1, step: 0.01 },
  { key: 'shadowThreshold', label: 'Shadow threshold', testId: 'shadow-threshold', min: 0, max: 0.95, step: 0.01 },
  { key: 'shadowBrightness', label: 'Shadow brightness', testId: 'shadow-brightness', min: 0.1, max: 1, step: 0.01 },
];

/** Centroid of the atom positions, or the origin when there is no structure. */
function centroidOf(positions: Vec3[]): Vec3 {
  if (positions.length === 0) return [0, 0, 0];
  const sum: Vec3 = [0, 0, 0];
  for (const [x, y, z] of positions) {
    sum[0] += x;
    sum[1] += y;
    sum[2] += z;
  }
  const n = positions.length;
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

// Camera presets: each looks at the centroid from one unit axis away. The
// viewer keeps the current distance (preserveDistance) and only uses the
// direction, so a unit offset is enough.
const PRESETS: { label: string; offset: Vec3; up: Vec3 }[] = [
  { label: 'Front', offset: [0, 0, 1], up: [0, 1, 0] },
  { label: 'Top', offset: [0, 1, 0], up: [0, 0, -1] },
  { label: 'Side', offset: [1, 0, 0], up: [0, 1, 0] },
];

export function ScenePanel() {
  const structureData = useStructureStore((s) => s.structureData);
  const triggerCameraView = useStructureStore((s) => s.triggerCameraView);

  const viewControls = useStructureStore((s) => s.viewControls);
  const setViewControls = useStructureStore((s) => s.setViewControls);

  const showHBonds = useStructureStore((s) => s.visParams.showHBonds);
  const setShowHBonds = useStructureStore((s) => s.setShowHBonds);

  const bondThreshold = useStructureStore((s) => s.visParams.bondThreshold);
  const setBondThreshold = useStructureStore((s) => s.setBondThreshold);

  const renderStyle = useStructureStore((s) => s.visParams.renderStyle);
  const cartoonParams = useStructureStore((s) => s.visParams.cartoonParams);
  const setVisParams = useStructureStore((s) => s.setVisParams);

  const positions = useMemo<Vec3[]>(
    () => structureData?.structure.positions ?? [],
    [structureData],
  );
  const hasStructure = positions.length > 0;

  const applyPreset = (offset: Vec3, up: Vec3) => {
    const c = centroidOf(positions);
    const position: Vec3 = [c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]];
    triggerCameraView(position, c, true, up);
  };

  // Debounced topology recompute so dragging the slider doesn't spam the backend.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleThreshold = (value: number) => {
    setBondThreshold(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void refreshTopology();
    }, 300);
  };

  const handleCartoonParam = (key: keyof CartoonParams, value: number) => {
    setVisParams({ cartoonParams: { ...cartoonParams, [key]: value } });
  };

  return (
    <Box sx={{ p: 2, width: 340 }}>
      <Typography variant="subtitle1" gutterBottom>
        Scene
      </Typography>

      <Typography variant="subtitle2" gutterBottom>
        Camera
      </Typography>
      <Stack direction="row" spacing={1}>
        {PRESETS.map(({ label, offset, up }) => (
          <Button
            key={label}
            size="small"
            variant="outlined"
            disabled={!hasStructure}
            onClick={() => applyPreset(offset, up)}
          >
            {label}
          </Button>
        ))}
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Display
      </Typography>
      <Stack>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={viewControls.showUnitCell}
              onChange={(e) =>
                setViewControls({ showUnitCell: e.target.checked })
              }
            />
          }
          label="Unit cell"
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={Boolean(viewControls.showAxesGizmo)}
              onChange={(e) =>
                setViewControls({ showAxesGizmo: e.target.checked })
              }
            />
          }
          label="Axes gizmo"
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={viewControls.showLabels}
              onChange={(e) =>
                setViewControls({ showLabels: e.target.checked })
              }
            />
          }
          label="Atom labels"
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={showHBonds}
              onChange={(e) => setShowHBonds(e.target.checked)}
            />
          }
          label="Hydrogen bonds"
        />
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Bond detection
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Threshold ({bondThreshold.toFixed(2)})
      </Typography>
      <Slider
        size="small"
        min={0.8}
        max={1.6}
        step={0.02}
        value={bondThreshold}
        onChange={(_, v) => handleThreshold(v as number)}
        aria-label="bond-threshold"
        slotProps={{ input: { 'data-testid': 'bond-threshold' } as never }}
      />

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Rendering
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={renderStyle}
        onChange={(_, mode) => {
          if (mode) setVisParams({ renderStyle: mode });
        }}
      >
        <ToggleButton value="standard">Standard</ToggleButton>
        <ToggleButton value="cartoon">Cartoon</ToggleButton>
        <ToggleButton value="soft">Soft</ToggleButton>
      </ToggleButtonGroup>

      {renderStyle === 'cartoon' && (
        <Box sx={{ mt: 1 }}>
          {CARTOON_SLIDERS.map(({ key, label, testId, min, max, step }) => (
            <Box key={key} sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {label} ({cartoonParams[key].toFixed(2)})
              </Typography>
              <Slider
                size="small"
                min={min}
                max={max}
                step={step}
                value={cartoonParams[key]}
                onChange={(_, v) => handleCartoonParam(key, v as number)}
                aria-label={testId}
                slotProps={{ input: { 'data-testid': testId } as never }}
              />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default ScenePanel;
