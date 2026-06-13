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
import { SelectionInput } from './SelectionInput';

// Bond-order overrides understood by the backend (besides the special "delete").
const BOND_ORDERS = ['1.0', '1.5', '2.0', '3.0'] as const;
type BondOrder = (typeof BOND_ORDERS)[number];

const ORDER_LABELS: Record<BondOrder, string> = {
  '1.0': 'Single (1)',
  '1.5': 'Aromatic (1.5)',
  '2.0': 'Double (2)',
  '3.0': 'Triple (3)',
};

/** Stable bond id from a pair of atom indices: always min-max. */
const bondIdFor = (i: number, j: number): string =>
  `${Math.min(i, j)}-${Math.max(i, j)}`;

export function BondEditPanel() {
  const selectedAtoms = useStructureStore((s) => s.selectedAtoms);
  const topologyOverrides = useStructureStore((s) => s.topologyOverrides);
  const setTopologyOverride = useStructureStore((s) => s.setTopologyOverride);
  const clearTopologyOverrides = useStructureStore((s) => s.clearTopologyOverrides);

  const [order, setOrder] = useState<BondOrder>('1.0');

  const pairId = useMemo(() => {
    if (selectedAtoms.length !== 2) return null;
    return bondIdFor(selectedAtoms[0], selectedAtoms[1]);
  }, [selectedAtoms]);

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

      <SelectionInput />

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Selected pair
      </Typography>
      {pairId ? (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Bond {selectedAtoms[0]}–{selectedAtoms[1]}
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
              onClick={() => applyOverride(pairId, order)}
            >
              Set order
            </Button>
          </Stack>
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteIcon />}
            onClick={() => applyOverride(pairId, 'delete')}
          >
            Delete bond
          </Button>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Select exactly two atoms to add, set the order of, or delete a bond.
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
