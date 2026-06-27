import { useMemo } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useStructureStore } from '../../store/useStructureStore';
import { ColorSwatch } from '../common/ColorSwatch';
import { displayPositions } from '../r3f/displayPositions';
import type { CartoonParams, LightingPreset } from '../../types/store';

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
  { key: 'outlineThickness', label: 'Outline thickness', testId: 'outline-thickness', min: 0.1, max: 30, step: 0.1 },
  // Highlight/shadow thresholds compare against a normalized light·normal dot product,
  // which is physically bounded to [-1, 1] — so 1 stays the ceiling; only the lower
  // bound is widened. shadowBrightness is a stylistic multiplier and can exceed 1.
  { key: 'highlightThreshold', label: 'Highlight threshold', testId: 'highlight-threshold', min: 0, max: 1, step: 0.01 },
  { key: 'shadowThreshold', label: 'Shadow threshold', testId: 'shadow-threshold', min: 0, max: 1, step: 0.01 },
  { key: 'shadowBrightness', label: 'Shadow brightness', testId: 'shadow-brightness', min: 0, max: 2, step: 0.01 },
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

const LIGHTING_PRESETS: { value: LightingPreset; label: string }[] = [
  { value: 'studio', label: 'Studio' },
  { value: 'flat', label: 'Flat' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'custom', label: 'Custom' },
];

// Per-light on/off toggles. setLight pins the preset to 'custom' on any change.
const LIGHTS: { key: 'ambientLight' | 'keyLight' | 'fillLight' | 'rimLight'; label: string }[] = [
  { key: 'ambientLight', label: 'Ambient' },
  { key: 'keyLight', label: 'Key' },
  { key: 'fillLight', label: 'Fill' },
  { key: 'rimLight', label: 'Rim' },
];

export function ScenePanel() {
  const structureData = useStructureStore((s) => s.structureData);
  const triggerCameraView = useStructureStore((s) => s.triggerCameraView);

  const viewControls = useStructureStore((s) => s.viewControls);
  const setViewControls = useStructureStore((s) => s.setViewControls);

  const cameraType = useStructureStore((s) => s.cameraType);
  const setCameraType = useStructureStore((s) => s.setCameraType);

  const renderStyle = useStructureStore((s) => s.visParams.renderStyle);
  const cartoonParams = useStructureStore((s) => s.visParams.cartoonParams);
  const setVisParams = useStructureStore((s) => s.setVisParams);

  const sceneSettings = useStructureStore((s) => s.sceneSettings);
  const setLightingPreset = useStructureStore((s) => s.setLightingPreset);
  const setLight = useStructureStore((s) => s.setLight);
  const toggleLightGizmos = useStructureStore((s) => s.toggleLightGizmos);

  // Background / brightness — relocated from StylePanel
  const setBackground = useStructureStore((s) => s.setBackground);
  const setGlobalBrightness = useStructureStore((s) => s.setGlobalBrightness);

  // Camera presets aim at the centroid of the DISPLAYED (wrapped, in-cell)
  // atoms so an out-of-cell periodic structure doesn't frame empty space.
  const positions = useMemo<Vec3[]>(
    () => (structureData ? (displayPositions(structureData.structure) as Vec3[]) : []),
    [structureData],
  );
  const hasStructure = positions.length > 0;

  const applyPreset = (offset: Vec3, up: Vec3) => {
    const c = centroidOf(positions);
    const position: Vec3 = [c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]];
    triggerCameraView(position, c, true, up);
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

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Projection
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={cameraType}
        onChange={(_, value) => {
          if (value) setCameraType(value);
        }}
        aria-label="projection"
      >
        <ToggleButton value="perspective">Perspective</ToggleButton>
        <ToggleButton value="orthographic">Orthographic</ToggleButton>
      </ToggleButtonGroup>

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
        <Tooltip title="Small XYZ orientation indicator">
          <span>
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
          </span>
        </Tooltip>
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
        <Tooltip title="Draw the ring torus inside aromatic rings; off redraws them as alternating single/double (Kekulé) bonds">
          <span>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={viewControls.showAromaticRings}
                  onChange={(e) =>
                    setViewControls({ showAromaticRings: e.target.checked })
                  }
                />
              }
              label="Aromatic rings"
            />
          </span>
        </Tooltip>
      </Stack>

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
        aria-label="render style"
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

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Lighting
      </Typography>
      <Select
        size="small"
        fullWidth
        value={sceneSettings.lightingPreset}
        onChange={(e) => setLightingPreset(e.target.value as LightingPreset)}
        inputProps={{ 'aria-label': 'lighting preset' }}
        sx={{ mb: 1 }}
      >
        {LIGHTING_PRESETS.map(({ value, label }) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </Select>
      <Stack>
        {LIGHTS.map(({ key, label }) => (
          <FormControlLabel
            key={key}
            control={
              <Checkbox
                size="small"
                checked={sceneSettings[key].enabled}
                onChange={(e) => setLight(key, { enabled: e.target.checked })}
              />
            }
            label={label}
          />
        ))}
        <Tooltip title="Show light-source markers">
          <span>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={sceneSettings.showLightGizmos}
                  onChange={() => toggleLightGizmos()}
                />
              }
              label="Light gizmos"
            />
          </span>
        </Tooltip>
      </Stack>
      {renderStyle === 'cartoon' && (
        <Typography variant="caption" color="text.secondary">
          Lighting has no effect in the Cartoon render style.
        </Typography>
      )}

      {/* Background and brightness — relocated from StylePanel */}
      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Background
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Color
        </Typography>
        <ColorSwatch
          color={sceneSettings.background.solidColor}
          onChange={(color) => setBackground({ solidColor: color })}
        />
      </Stack>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={Boolean(viewControls.forceTransparentBackground)}
            onChange={(e) =>
              setViewControls({ forceTransparentBackground: e.target.checked })
            }
          />
        }
        label="Transparent background"
      />
      <Typography variant="caption" color="text.secondary">
        Brightness ({sceneSettings.globalBrightness.toFixed(2)})
      </Typography>
      <Slider
        size="small"
        min={0}
        max={5}
        step={0.05}
        value={sceneSettings.globalBrightness}
        onChange={(_, v) => setGlobalBrightness(v as number)}
        aria-label="brightness"
        slotProps={{ input: { 'data-testid': 'brightness' } as never }}
      />
    </Box>
  );
}

export default ScenePanel;
