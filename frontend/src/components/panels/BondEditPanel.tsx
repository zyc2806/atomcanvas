import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Slider,
  Stack,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UndoIcon from '@mui/icons-material/Undo';
import { useStructureStore } from '../../store/useStructureStore';
import { refreshTopologyOrNotify } from '../../services/topologyRefresh';
import { BOND_ORDERS, ORDER_LABELS, type BondOrder } from '../../utils/bondOrders';
import { useBondEdits } from '../../hooks/useBondEdits';

/** Stable bond id from a pair of atom indices: always min-max. */
const bondIdFor = (i: number, j: number): string =>
  `${Math.min(i, j)}-${Math.max(i, j)}`;

export function BondEditPanel() {
  const selectedAtoms = useStructureStore((s) => s.selectedAtoms);
  const selectedBonds = useStructureStore((s) => s.selectedBonds);
  const topologyOverrides = useStructureStore((s) => s.topologyOverrides);
  const setTopologyOverride = useStructureStore((s) => s.setTopologyOverride);
  const clearTopologyOverrides = useStructureStore((s) => s.clearTopologyOverrides);
  const notify = useStructureStore((s) => s.notify);
  const { setBondsOrder, deleteBonds } = useBondEdits();

  // Bond appearance — relocated from StylePanel
  const bondRadius = useStructureStore((s) => s.visParams.bondRadius);
  const setVisParams = useStructureStore((s) => s.setVisParams);
  const bondsStyle = useStructureStore((s) => s.bondsStyle);
  const setBondsStyle = useStructureStore((s) => s.setBondsStyle);

  // Bond detection — relocated from ScenePanel
  const showHBonds = useStructureStore((s) => s.visParams.showHBonds);
  const setShowHBonds = useStructureStore((s) => s.setShowHBonds);
  const bondThreshold = useStructureStore((s) => s.visParams.bondThreshold);
  const setBondThreshold = useStructureStore((s) => s.setBondThreshold);

  const [order, setOrder] = useState<BondOrder>('1.0');

  // Debounced topology recompute so dragging the slider doesn't spam the backend.
  // Relocated from ScenePanel along with the bond threshold section.
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
      void refreshTopologyOrNotify(notify);
    }, 300);
  };

  // Bonds to act on. A bond clicked in the viewer populates `selectedBonds`
  // and takes priority; otherwise fall back to the bond implied by a two-atom
  // selection so the user can still create or edit a bond between two atoms
  // that may not yet be bonded.
  const targetBondIds = useMemo<string[]>(() => {
    if (selectedBonds.length > 0) return selectedBonds;
    if (selectedAtoms.length === 2) return [bondIdFor(selectedAtoms[0], selectedAtoms[1])];
    return [];
  }, [selectedBonds, selectedAtoms]);

  const targetLabel =
    selectedBonds.length > 0
      ? `${selectedBonds.length} bond${selectedBonds.length === 1 ? '' : 's'} selected`
      : selectedAtoms.length === 2
        ? `Bond ${selectedAtoms[0]}–${selectedAtoms[1]}`
        : null;

  const overrideEntries = useMemo(
    () => Object.entries(topologyOverrides),
    [topologyOverrides],
  );

  const applyOverride = async (id: string, value: string | null) => {
    setTopologyOverride(id, value);
    await refreshTopologyOrNotify(notify);
  };

  return (
    <Box sx={{ p: 2, width: 340 }}>
      <Typography variant="subtitle1" gutterBottom>
        Bonds
      </Typography>

      {/* Bond appearance section — relocated from StylePanel */}
      <Typography variant="subtitle2" gutterBottom>
        Bond appearance
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Radius ({bondRadius.toFixed(2)})
      </Typography>
      <Slider
        size="small"
        min={0.01}
        max={2.0}
        step={0.01}
        value={bondRadius}
        onChange={(_, v) => {
          setVisParams({ bondRadius: v as number });
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
        aria-label="bond color mode"
      >
        <Tooltip title="Each bond half takes its atom's element color">
          <span>
            <ToggleButton value="element-split">Split</ToggleButton>
          </span>
        </Tooltip>
        <Tooltip title="One color for all bonds">
          <span>
            <ToggleButton value="uniform">Uniform</ToggleButton>
          </span>
        </Tooltip>
      </ToggleButtonGroup>

      <Divider sx={{ my: 2 }} />

      {/* Bond detection section — relocated from ScenePanel */}
      <Typography variant="subtitle2" gutterBottom>
        Bond detection
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Threshold ({bondThreshold.toFixed(2)})
      </Typography>
      <Slider
        size="small"
        min={0.4}
        max={3.0}
        step={0.02}
        value={bondThreshold}
        onChange={(_, v) => handleThreshold(v as number)}
        aria-label="bond-threshold"
        slotProps={{ input: { 'data-testid': 'bond-threshold' } as never }}
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

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Selected bond{targetBondIds.length === 1 ? '' : 's'}
      </Typography>
      {targetBondIds.length > 0 ? (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            {targetLabel}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Select
              size="small"
              value={order}
              onChange={(e) => setOrder(e.target.value as BondOrder)}
              aria-label="bond order"
              sx={{ minWidth: 150 }}
            >
              {BOND_ORDERS.map((o) => (
                <MenuItem key={o} value={o}>
                  {ORDER_LABELS[o]}
                </MenuItem>
              ))}
            </Select>
            <Button
              size="small"
              variant="contained"
              onClick={() => setBondsOrder(targetBondIds, order)}
            >
              Set order
            </Button>
          </Stack>
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteIcon />}
            onClick={() => deleteBonds(targetBondIds)}
          >
            Delete bond{targetBondIds.length === 1 ? '' : 's'}
          </Button>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Click a bond in the viewer, or select exactly two atoms, to set its
          order or delete it.
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Typography variant="subtitle2">
          Your bond edits ({overrideEntries.length})
        </Typography>
        {overrideEntries.length > 0 && (
          <Button
            size="small"
            color="inherit"
            onClick={async () => {
              clearTopologyOverrides();
              await refreshTopologyOrNotify(notify);
            }}
          >
            Clear all
          </Button>
        )}
      </Stack>

      {overrideEntries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No bond edits yet.
        </Typography>
      ) : (
        <List dense disablePadding>
          {overrideEntries.map(([id, value]) => {
            const [i, j] = id.split('-');
            const label =
              value === 'delete'
                ? 'Deleted'
                : (ORDER_LABELS[value as keyof typeof ORDER_LABELS] ?? value);
            return (
              <ListItem
                key={id}
                disableGutters
                secondaryAction={
                  <Tooltip title="Revert">
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label={`revert-${id}`}
                      onClick={() => applyOverride(id, null)}
                    >
                      <UndoIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemText
                  primary={`${i}–${j}: ${label}`}
                  slotProps={{ primary: { variant: 'body2' } }}
                />
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
}

export default BondEditPanel;
