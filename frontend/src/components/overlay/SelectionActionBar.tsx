import { Paper, Stack, Typography, IconButton, Tooltip, Divider } from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ClearIcon from '@mui/icons-material/Clear';
import useStructureStore from '../../store/useStructureStore';
import { ColorSwatch } from '../common/ColorSwatch';

export function SelectionActionBar() {
  const selectedAtoms = useStructureStore((s) => s.selectedAtoms);
  const radiusOverrides = useStructureStore((s) => s.radiusOverrides);
  const colorOverrides = useStructureStore((s) => s.colorOverrides);
  const applySelectionColor = useStructureStore((s) => s.applySelectionColor);
  const applySelectionSize = useStructureStore((s) => s.applySelectionSize);
  const toggleSelectionHidden = useStructureStore((s) => s.toggleSelectionHidden);
  const clearSelection = useStructureStore((s) => s.clearSelection);
  const notify = useStructureStore((s) => s.notify);

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
          <IconButton size="small" aria-label="hide" onClick={() => { toggleSelectionHidden(selectedAtoms); notify(`Toggled visibility of ${n} atom${n > 1 ? 's' : ''}`); }}>
            <VisibilityOffIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Clear selection">
          <IconButton size="small" aria-label="clear" onClick={() => clearSelection()}><ClearIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

export default SelectionActionBar;
