import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UndoIcon from '@mui/icons-material/Undo';
import { useStructureStore } from '../../store/useStructureStore';
import { refreshTopology } from '../../services/topologyRefresh';
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
  const { setBondsOrder, deleteBonds } = useBondEdits();

  const [order, setOrder] = useState<BondOrder>('1.0');

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
    await refreshTopology();
  };

  return (
    <Box sx={{ p: 2, width: 340 }}>
      <Typography variant="subtitle1" gutterBottom>
        Bonds
      </Typography>

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
          Manual overrides ({overrideEntries.length})
        </Typography>
        {overrideEntries.length > 0 && (
          <Button
            size="small"
            color="inherit"
            onClick={async () => {
              clearTopologyOverrides();
              await refreshTopology();
            }}
          >
            Clear all
          </Button>
        )}
      </Stack>

      {overrideEntries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No manual bond overrides.
        </Typography>
      ) : (
        <List dense disablePadding>
          {overrideEntries.map(([id, value]) => {
            const [i, j] = id.split('-');
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
                  primary={`${i}–${j} → ${value}`}
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
