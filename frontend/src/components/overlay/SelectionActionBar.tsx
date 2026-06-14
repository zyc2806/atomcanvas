import { useState } from 'react';
import { Paper, Stack, Typography, IconButton, Tooltip, Popover, Box, Button, Divider } from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ClearIcon from '@mui/icons-material/Clear';
import useStructureStore from '../../store/useStructureStore';

const SWATCHES = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ffffff'];

export function SelectionActionBar() {
  const selectedAtoms = useStructureStore((s) => s.selectedAtoms);
  const radiusOverrides = useStructureStore((s) => s.radiusOverrides);
  const applySelectionColor = useStructureStore((s) => s.applySelectionColor);
  const applySelectionSize = useStructureStore((s) => s.applySelectionSize);
  const toggleSelectionHidden = useStructureStore((s) => s.toggleSelectionHidden);
  const clearSelection = useStructureStore((s) => s.clearSelection);
  const notify = useStructureStore((s) => s.notify);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);

  if (selectedAtoms.length === 0) return null;
  const n = selectedAtoms.length;

  const currentScale = () => {
    const vals = selectedAtoms.map((i) => radiusOverrides?.[i] ?? 1.0);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const bumpSize = (delta: number) => {
    const next = Math.max(0.2, Math.min(3, +(currentScale() + delta).toFixed(2)));
    applySelectionSize(selectedAtoms, next);
    notify(`Resized ${n} atom${n > 1 ? 's' : ''}`);
  };

  return (
    <Paper
      elevation={6}
      sx={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', px: 2, py: 1, borderRadius: 3, zIndex: 5 }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="body2" color="primary">{n} selected</Typography>
        <Divider orientation="vertical" flexItem />
        <Tooltip title="Color">
          <IconButton size="small" aria-label="color" onClick={(e) => setColorAnchor(e.currentTarget)}>
            <Box sx={{ width: 18, height: 18, borderRadius: 1, bgcolor: 'primary.main', border: '1px solid #888' }} />
          </IconButton>
        </Tooltip>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Tooltip title="Smaller"><IconButton size="small" aria-label="decrease size" onClick={() => bumpSize(-0.2)}><RemoveIcon fontSize="small" /></IconButton></Tooltip>
          <Typography variant="caption">Size</Typography>
          <Tooltip title="Larger"><IconButton size="small" aria-label="increase size" onClick={() => bumpSize(0.2)}><AddIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
        <Tooltip title="Hide / show">
          <IconButton size="small" aria-label="hide" onClick={() => { toggleSelectionHidden(selectedAtoms); notify(`Toggled visibility of ${n} atom${n > 1 ? 's' : ''}`); }}>
            <VisibilityOffIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Clear selection">
          <IconButton size="small" aria-label="clear" onClick={() => clearSelection()}><ClearIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <Popover open={!!colorAnchor} anchorEl={colorAnchor} onClose={() => setColorAnchor(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Box sx={{ display: 'flex', gap: 1, p: 1.5, maxWidth: 200, flexWrap: 'wrap' }}>
          {SWATCHES.map((c) => (
            <Button key={c} sx={{ minWidth: 28, height: 28, p: 0, bgcolor: c, border: '1px solid #888', '&:hover': { bgcolor: c } }}
              aria-label={`color ${c}`}
              onClick={() => { applySelectionColor(selectedAtoms, c); notify(`Recolored ${n} atom${n > 1 ? 's' : ''}`, 'success'); setColorAnchor(null); }} />
          ))}
        </Box>
      </Popover>
    </Paper>
  );
}

export default SelectionActionBar;
