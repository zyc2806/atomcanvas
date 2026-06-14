import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  Popover,
  Slider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { HexColorPicker } from 'react-colorful';
import { useStructureStore } from '../../store/useStructureStore';
import { elementStylesToAtomOverrides } from '../../services/elementStyleApply';
import type { ElementStyle } from '../../types/store';

const DEFAULT_ATOM_COLOR = '#cccccc';

/**
 * Small color-swatch button that opens a react-colorful picker in a Popover.
 */
function ColorSwatch({
  color,
  onChange,
  size = 24,
  testId,
}: {
  color: string;
  onChange: (color: string) => void;
  size?: number;
  testId?: string;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label="pick color"
        data-testid={testId}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        // The dynamic fill lives in an inline style (not sx) so it is the
        // element's own backgroundColor — readable in tests and overriding the
        // emotion class deterministically.
        style={{ backgroundColor: color }}
        sx={{
          width: size,
          height: size,
          borderRadius: 1,
          border: '1px solid rgba(255,255,255,0.3)',
          cursor: 'pointer',
          p: 0,
        }}
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5 }}>
          <HexColorPicker color={color} onChange={onChange} />
        </Box>
      </Popover>
    </>
  );
}

export function StylePanel() {
  const structureData = useStructureStore((s) => s.structureData);
  const elements = useStructureStore((s) => s.elements);
  const setElementStyle = useStructureStore((s) => s.setElementStyle);
  const clearElementStyle = useStructureStore((s) => s.clearElementStyle);

  const bondsStyle = useStructureStore((s) => s.bondsStyle);
  const setBondsStyle = useStructureStore((s) => s.setBondsStyle);

  // The viewport (Bonds.tsx) and the glb export both size bonds from
  // visParams.bondRadius, so that is the source of truth the slider drives;
  // bondsStyle.radius is kept in sync only so the style/scene preset persists it.
  const bondRadius = useStructureStore((s) => s.visParams.bondRadius);
  const setVisParams = useStructureStore((s) => s.setVisParams);

  const sceneSettings = useStructureStore((s) => s.sceneSettings);
  const setBackground = useStructureStore((s) => s.setBackground);
  const setGlobalBrightness = useStructureStore((s) => s.setGlobalBrightness);

  const viewControls = useStructureStore((s) => s.viewControls);
  const setViewControls = useStructureStore((s) => s.setViewControls);

  const atomStyles = useStructureStore((s) => s.atomStyles);

  const selectedAtoms = useStructureStore((s) => s.selectedAtoms);
  const colorOverrides = useStructureStore((s) => s.colorOverrides);
  const setColorOverrides = useStructureStore((s) => s.setColorOverrides);
  const setOpacityOverrides = useStructureStore((s) => s.setOpacityOverrides);
  const radiusOverrides = useStructureStore((s) => s.radiusOverrides);
  const setRadiusOverrides = useStructureStore((s) => s.setRadiusOverrides);

  const symbols = useMemo<string[]>(
    () => structureData?.structure.symbols ?? [],
    [structureData],
  );

  const distinctElements = useMemo(
    () => Array.from(new Set(symbols)),
    [symbols],
  );

  // Per-atom overrides (e.g. from the canvas selection) that the element-level
  // styling must NOT clobber. We keep them in refs so a recompute triggered by an
  // element-style change re-merges them on top (per-atom override wins).
  const perAtomColorRef = useRef<{ [i: number]: string } | null>(null);
  const perAtomOpacityRef = useRef<{ [i: number]: number } | null>(null);

  useEffect(() => {
    if (symbols.length === 0) {
      return;
    }
    const { colorOverrides: elColors, opacityOverrides: elOpacities } =
      elementStylesToAtomOverrides(symbols, elements);

    const mergedColors = { ...elColors, ...(perAtomColorRef.current ?? {}) };
    const mergedOpacities = {
      ...elOpacities,
      ...(perAtomOpacityRef.current ?? {}),
    };

    setColorOverrides(Object.keys(mergedColors).length > 0 ? mergedColors : null);
    setOpacityOverrides(
      Object.keys(mergedOpacities).length > 0 ? mergedOpacities : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, symbols]);

  const handleSelectedColor = (color: string) => {
    const fromSelection: { [i: number]: string } = {};
    selectedAtoms.forEach((idx) => {
      fromSelection[idx] = color;
    });
    perAtomColorRef.current = {
      ...(perAtomColorRef.current ?? {}),
      ...fromSelection,
    };
    const existing = colorOverrides ?? {};
    setColorOverrides({ ...existing, ...fromSelection });
  };

  // Per-atom size override (multiplier) applied to every selected atom. The
  // renderer multiplies the element radius by this factor (default 1.0).
  const handleSelectedSize = (size: number) => {
    const next = { ...(radiusOverrides ?? {}) };
    selectedAtoms.forEach((idx) => {
      next[idx] = size;
    });
    setRadiusOverrides(next);
  };

  // Prefer a user override, then the effective CPK colour loaded from
  // atom.json, and only fall back to the neutral gray when neither exists.
  const elementColor = (sym: string): string =>
    elements[sym]?.color ?? atomStyles?.[sym]?.color ?? DEFAULT_ATOM_COLOR;

  const update = (sym: string, patch: ElementStyle) =>
    setElementStyle(sym, patch);

  return (
    <Box sx={{ p: 2, width: 340 }}>
      <Typography variant="subtitle1" gutterBottom>
        Style
      </Typography>

      <Table size="small" aria-label="element styles">
        <TableHead>
          <TableRow>
            <TableCell>Element</TableCell>
            <TableCell>Color</TableCell>
            <TableCell>Radius</TableCell>
            <TableCell>Opacity</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {distinctElements.map((sym) => {
            const st = elements[sym] ?? {};
            return (
              <TableRow key={sym}>
                <TableCell>{sym}</TableCell>
                <TableCell>
                  <ColorSwatch
                    color={elementColor(sym)}
                    onChange={(color) => update(sym, { color })}
                    testId={`color-${sym}`}
                  />
                </TableCell>
                <TableCell sx={{ minWidth: 90 }}>
                  <Slider
                    size="small"
                    min={0.3}
                    max={2.0}
                    step={0.05}
                    value={st.radiusScale ?? 1.0}
                    onChange={(_, v) => update(sym, { radiusScale: v as number })}
                    aria-label={`radius-${sym}`}
                    slotProps={{
                      input: { 'data-testid': `radius-${sym}` } as never,
                    }}
                  />
                </TableCell>
                <TableCell sx={{ minWidth: 90 }}>
                  <Slider
                    size="small"
                    min={0}
                    max={1}
                    step={0.05}
                    value={st.opacity ?? 1.0}
                    onChange={(_, v) => update(sym, { opacity: v as number })}
                    aria-label={`opacity-${sym}`}
                    slotProps={{
                      input: { 'data-testid': `opacity-${sym}` } as never,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <IconButton
                    size="small"
                    aria-label={`reset-${sym}`}
                    onClick={() => clearElementStyle(sym)}
                  >
                    <RestartAltIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {selectedAtoms.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Selected atoms ({selectedAtoms.length})
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Color
            </Typography>
            <ColorSwatch
              color={
                colorOverrides?.[selectedAtoms[0]] ??
                atomStyles?.[symbols[selectedAtoms[0]]]?.color ??
                DEFAULT_ATOM_COLOR
              }
              onChange={handleSelectedColor}
              testId="selected-color"
            />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Size
            </Typography>
            <Slider
              size="small"
              min={0.3}
              max={2.0}
              step={0.05}
              value={radiusOverrides?.[selectedAtoms[0]] ?? 1.0}
              onChange={(_, v) => handleSelectedSize(v as number)}
              aria-label="selected-size"
              slotProps={{ input: { 'data-testid': 'selected-size' } as never }}
              sx={{ flex: 1 }}
            />
          </Stack>
        </>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" gutterBottom>
        Bonds
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Radius ({bondRadius.toFixed(2)})
      </Typography>
      <Slider
        size="small"
        min={0.02}
        max={0.4}
        step={0.01}
        value={bondRadius}
        onChange={(_, v) => {
          const radius = v as number;
          setVisParams({ bondRadius: radius });
          setBondsStyle({ radius });
        }}
        aria-label="bond-radius"
        slotProps={{ input: { 'data-testid': 'bond-radius' } as never }}
      />
      <ToggleButtonGroup
        size="small"
        exclusive
        value={bondsStyle.colorMode}
        onChange={(_, mode) => {
          if (mode) setBondsStyle({ colorMode: mode });
        }}
        sx={{ mt: 1 }}
      >
        <ToggleButton value="element-split">Split</ToggleButton>
        <ToggleButton value="uniform">Uniform</ToggleButton>
      </ToggleButtonGroup>

      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" gutterBottom>
        Scene
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Background
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
        max={2}
        step={0.05}
        value={sceneSettings.globalBrightness}
        onChange={(_, v) => setGlobalBrightness(v as number)}
        aria-label="brightness"
        slotProps={{ input: { 'data-testid': 'brightness' } as never }}
      />

      <Box sx={{ mt: 2 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            distinctElements.forEach((sym) => clearElementStyle(sym));
            perAtomColorRef.current = null;
            perAtomOpacityRef.current = null;
            setColorOverrides(null);
            setOpacityOverrides(null);
            setRadiusOverrides(null);
          }}
        >
          Reset all styles
        </Button>
      </Box>
    </Box>
  );
}

export default StylePanel;
