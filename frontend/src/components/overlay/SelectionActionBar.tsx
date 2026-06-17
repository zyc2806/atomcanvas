import { useState } from 'react';
import { Paper, Stack, Typography, IconButton, Tooltip, Divider, Select, MenuItem, Button } from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import useStructureStore from '../../store/useStructureStore';
import { ColorSwatch } from '../common/ColorSwatch';
import { BOND_ORDERS, ORDER_LABELS, type BondOrder } from '../../utils/bondOrders';
import { useBondEdits } from '../../hooks/useBondEdits';

export function SelectionActionBar() {
  const selectedAtoms = useStructureStore((s) => s.selectedAtoms);
  const selectedBonds = useStructureStore((s) => s.selectedBonds);
  const radiusOverrides = useStructureStore((s) => s.radiusOverrides);
  const colorOverrides = useStructureStore((s) => s.colorOverrides);
  const bondOpacityOverrides = useStructureStore((s) => s.bondOpacityOverrides);
  const applySelectionColor = useStructureStore((s) => s.applySelectionColor);
  const applySelectionSize = useStructureStore((s) => s.applySelectionSize);
  const toggleSelectionHidden = useStructureStore((s) => s.toggleSelectionHidden);
  const clearSelection = useStructureStore((s) => s.clearSelection);
  const notify = useStructureStore((s) => s.notify);
  const { setBondsOrder, deleteBonds, setBondsOpacity } = useBondEdits();

  const [bondOrder, setBondOrder] = useState<BondOrder>('1.0');

  if (selectedAtoms.length === 0 && selectedBonds.length === 0) return null;

  const nAtoms = selectedAtoms.length;
  const nBonds = selectedBonds.length;

  // Build label: "2 atoms + 1 bond selected", "3 atoms selected", "2 bonds selected"
  const buildLabel = () => {
    const atomPart = nAtoms > 0 ? `${nAtoms} atom${nAtoms === 1 ? '' : 's'}` : '';
    const bondPart = nBonds > 0 ? `${nBonds} bond${nBonds === 1 ? '' : 's'}` : '';
    if (atomPart && bondPart) return `${atomPart} + ${bondPart} selected`;
    return `${atomPart || bondPart} selected`;
  };

  // Atom size controls
  const currentScale = () => {
    const vals = selectedAtoms.map((i) => radiusOverrides?.[i] ?? 1.0);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const bumpSize = (delta: number) => {
    const next = Math.max(0.2, Math.min(3, +(currentScale() + delta).toFixed(2)));
    applySelectionSize(selectedAtoms, next);
    notify(`Resized ${nAtoms} atom${nAtoms > 1 ? 's' : ''}`);
  };

  // Bond opacity controls
  const currentBondOpacity = () => {
    if (selectedBonds.length === 0) return 1.0;
    const vals = selectedBonds.map((id) => bondOpacityOverrides?.[id] ?? 1.0);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const bumpBondOpacity = (delta: number) => {
    const next = Math.max(0, Math.min(1, +(currentBondOpacity() + delta).toFixed(2)));
    setBondsOpacity(selectedBonds, next);
    notify(`Bond opacity set to ${Math.round(next * 100)}%`);
  };

  return (
    <Paper
      elevation={6}
      sx={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', px: 2, py: 1, borderRadius: 3, zIndex: 5 }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="body2" color="primary">{buildLabel()}</Typography>

        {/* Atom controls — only when atoms are selected */}
        {nAtoms > 0 && (
          <>
            <Divider orientation="vertical" flexItem />
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption">Color</Typography>
              {/* Full picker — same control as the StylePanel sidebar, not presets. */}
              <ColorSwatch
                color={colorOverrides?.[selectedAtoms[0]] ?? '#ffffff'}
                onChange={(c) => applySelectionColor(selectedAtoms, c)}
                size={18}
                testId="selection-color"
              />
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title="Smaller"><IconButton size="small" aria-label="decrease size" onClick={() => bumpSize(-0.2)}><RemoveIcon fontSize="small" /></IconButton></Tooltip>
              <Typography variant="caption">Size</Typography>
              <Tooltip title="Larger"><IconButton size="small" aria-label="increase size" onClick={() => bumpSize(0.2)}><AddIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
            <Tooltip title="Hide / show">
              <IconButton size="small" aria-label="hide" onClick={() => { toggleSelectionHidden(selectedAtoms); notify(`Toggled visibility of ${nAtoms} atom${nAtoms > 1 ? 's' : ''}`); }}>
                <VisibilityOffIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}

        {/* Bond controls — only when bonds are selected */}
        {nBonds > 0 && (
          <>
            <Divider orientation="vertical" flexItem />
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title="Less opaque"><IconButton size="small" aria-label="decrease bond opacity" onClick={() => bumpBondOpacity(-0.2)}><RemoveIcon fontSize="small" /></IconButton></Tooltip>
              <Typography variant="caption">Opacity</Typography>
              <Tooltip title="More opaque"><IconButton size="small" aria-label="increase bond opacity" onClick={() => bumpBondOpacity(0.2)}><AddIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Select
                size="small"
                value={bondOrder}
                onChange={(e) => setBondOrder(e.target.value as BondOrder)}
                inputProps={{ 'aria-label': 'bond order' }}
                sx={{ minWidth: 130, fontSize: '0.75rem' }}
              >
                {BOND_ORDERS.map((o) => (
                  <MenuItem key={o} value={o} sx={{ fontSize: '0.75rem' }}>{ORDER_LABELS[o]}</MenuItem>
                ))}
              </Select>
              <Button
                size="small"
                variant="contained"
                onClick={async () => {
                  await setBondsOrder(selectedBonds, bondOrder);
                  notify(`Set order for ${nBonds} bond${nBonds > 1 ? 's' : ''}`);
                }}
              >
                Set order
              </Button>
            </Stack>
            <Tooltip title="Delete selected bonds">
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<DeleteIcon fontSize="small" />}
                aria-label={`delete bond${nBonds > 1 ? 's' : ''}`}
                onClick={async () => {
                  await deleteBonds(selectedBonds);
                  notify(`Deleted ${nBonds} bond${nBonds > 1 ? 's' : ''}`);
                }}
              >
                Delete bond{nBonds > 1 ? 's' : ''}
              </Button>
            </Tooltip>
          </>
        )}

        <Tooltip title="Clear selection">
          <IconButton size="small" aria-label="clear" onClick={() => clearSelection()}><ClearIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

export default SelectionActionBar;
