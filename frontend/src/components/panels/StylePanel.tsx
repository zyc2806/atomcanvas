import { useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { ColorSwatch } from '../common/ColorSwatch';
import { useStructureStore } from '../../store/useStructureStore';
import { elementStylesToAtomOverrides } from '../../services/elementStyleApply';
import type { ElementStyle } from '../../types/store';

const DEFAULT_ATOM_COLOR = '#cccccc';

export function StylePanel() {
  const structureData = useStructureStore((s) => s.structureData);
  const elements = useStructureStore((s) => s.elements);
  const setElementStyle = useStructureStore((s) => s.setElementStyle);
  const clearElementStyle = useStructureStore((s) => s.clearElementStyle);

  const displayMode = useStructureStore((s) => s.visParams.displayMode);
  const setDisplayMode = useStructureStore((s) => s.setDisplayMode);

  const atomStyles = useStructureStore((s) => s.atomStyles);

  const selectedAtoms = useStructureStore((s) => s.selectedAtoms);
  const setColorOverrides = useStructureStore((s) => s.setColorOverrides);
  const setOpacityOverrides = useStructureStore((s) => s.setOpacityOverrides);
  const setRadiusOverrides = useStructureStore((s) => s.setRadiusOverrides);
  const perAtomColorOverrides = useStructureStore((s) => s.perAtomColorOverrides);
  const perAtomOpacityOverrides = useStructureStore((s) => s.perAtomOpacityOverrides);
  const pushHistory = useStructureStore((s) => s.pushHistory);
  const notify = useStructureStore((s) => s.notify);

  const symbols = useMemo<string[]>(
    () => structureData?.structure.symbols ?? [],
    [structureData],
  );

  const distinctElements = useMemo(
    () => Array.from(new Set(symbols)),
    [symbols],
  );

  // Per-atom overrides (e.g. from the canvas selection) live in the store and
  // the element-level styling must NOT clobber them. A recompute triggered by an
  // element-style change re-merges them on top (per-atom override wins).
  useEffect(() => {
    if (symbols.length === 0) {
      return;
    }
    const { colorOverrides: elColors, opacityOverrides: elOpacities } =
      elementStylesToAtomOverrides(symbols, elements);

    const mergedColors = { ...elColors, ...(perAtomColorOverrides ?? {}) };
    const mergedOpacities = {
      ...elOpacities,
      ...(perAtomOpacityOverrides ?? {}),
    };

    setColorOverrides(Object.keys(mergedColors).length > 0 ? mergedColors : null);
    setOpacityOverrides(
      Object.keys(mergedOpacities).length > 0 ? mergedOpacities : null,
    );
  }, [
    elements,
    symbols,
    perAtomColorOverrides,
    perAtomOpacityOverrides,
    setColorOverrides,
    setOpacityOverrides,
  ]);

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

      <Typography variant="subtitle2" gutterBottom>
        Display mode
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={displayMode}
        onChange={(_, mode) => {
          if (mode) setDisplayMode(mode);
        }}
        sx={{ mb: 2 }}
        aria-label="display mode"
      >
        <ToggleButton value="ball-stick">{'Ball & stick'}</ToggleButton>
        <Tooltip title="Van der Waals spheres (space-filling)">
          <span>
            <ToggleButton value="vdw">vdW</ToggleButton>
          </span>
        </Tooltip>
        <ToggleButton value="wireframe">Wireframe</ToggleButton>
      </ToggleButtonGroup>

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
                    min={0.1}
                    max={5.0}
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
          <Typography variant="caption" color="text.secondary">
            Recolor or resize selected atoms from the toolbar at the bottom of
            the viewer.
          </Typography>
        </>
      )}

      <Box sx={{ mt: 2 }}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            // Snapshot BEFORE mutating so Cmd+Z restores the user's tuned figure
            // (both per-element styles and per-atom overrides — see HistorySnapshot).
            pushHistory();
            distinctElements.forEach((sym) => clearElementStyle(sym));
            // Clear per-atom truth first so the element-restyle effect does not
            // re-merge stale per-atom overrides back over the cleared maps.
            useStructureStore.setState({
              perAtomColorOverrides: null,
              perAtomOpacityOverrides: null,
            });
            setColorOverrides(null);
            setOpacityOverrides(null);
            setRadiusOverrides(null);
            notify('Reset all styles');
          }}
        >
          Reset all styles
        </Button>
      </Box>
    </Box>
  );
}

export default StylePanel;
