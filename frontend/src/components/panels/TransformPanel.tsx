import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useStructureStore } from '../../store/useStructureStore';
import { bondService } from '../../services/bondService';

type VectorType = 'cartesian' | 'lattice';

function errorDetail(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || error.message;
  }
  return error instanceof Error ? error.message : 'An unknown error occurred';
}

export function TransformPanel() {
  const cell = useStructureStore((s) => s.structureData?.structure.cell);
  const hasStructure = useStructureStore((s) => Boolean(s.structureData));
  const hasCell = Boolean(cell);

  // Translate controls (local state — applied on the explicit Apply click).
  const [vectorType, setVectorType] = useState<VectorType>('cartesian');
  const [dx, setDx] = useState('0');
  const [dy, setDy] = useState('0');
  const [dz, setDz] = useState('0');
  // Default ON: a periodic structure should keep its atoms inside the cell after a
  // translate. The checkbox is gated by hasCell (disabled + ignored) when there is
  // no unit cell, so this default is a no-op for molecules.
  const [wrap, setWrap] = useState(true);

  // Supercell controls.
  const [nx, setNx] = useState('1');
  const [ny, setNy] = useState('1');
  const [nz, setNz] = useState('1');

  // In-flight guard: prevents double-submit while a request is pending.
  const [busy, setBusy] = useState(false);

  const handleApplyTranslate = async () => {
    if (busy) return;
    const s = useStructureStore.getState();
    if (!s.structureData) return;
    setBusy(true);
    const vector: [number, number, number] = [Number(dx) || 0, Number(dy) || 0, Number(dz) || 0];
    try {
      const doc = await bondService.translateStructure(
        s.structureData.structure,
        vector,
        vectorType,
        wrap && hasCell,
      );
      // pushHistory only on success — a failed call must not create a ghost undo frame.
      // The store is unchanged during the await so this correctly captures pre-mutation state.
      s.pushHistory();
      useStructureStore.getState().setStructureData(doc);
    } catch (error) {
      s.notify(`Translate failed: ${errorDetail(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleBuildSupercell = async () => {
    if (busy) return;
    const s = useStructureStore.getState();
    if (!s.structureData) return;
    setBusy(true);
    const reps: [number, number, number] = [
      Math.max(1, Math.round(Number(nx) || 1)),
      Math.max(1, Math.round(Number(ny) || 1)),
      Math.max(1, Math.round(Number(nz) || 1)),
    ];
    try {
      const doc = await bondService.buildSupercell(s.structureData.structure, reps);
      // pushHistory only on success — a failed call must not create a ghost undo frame.
      // The store is unchanged during the await so this correctly captures pre-mutation state.
      s.pushHistory();
      const next = useStructureStore.getState();
      next.setStructureData(doc); // resets selection; does NOT push history again.
      // A supercell changes the atom count, so per-atom/bond overrides keyed by
      // the old indices would mis-map onto the larger cell. Clear them. Undo
      // still restores the old overrides because they were captured in the
      // history frame pushed above.
      next.clearTopologyOverrides();
      next.setRadiusOverrides(null);
    } catch (error) {
      s.notify(`Supercell failed: ${errorDetail(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ p: 2, width: 340 }}>
      <Typography variant="subtitle1" gutterBottom>
        Transform
      </Typography>

      <Typography variant="subtitle2" gutterBottom>
        Translate
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={vectorType}
        onChange={(_, value: VectorType | null) => {
          if (value) setVectorType(value);
        }}
        sx={{ mb: 1 }}
        aria-label="coordinate system"
      >
        <ToggleButton value="cartesian">Cartesian (Å)</ToggleButton>
        <Tooltip title="Fractional cell coordinates (0–1 along each lattice vector)">
          <span>
            <ToggleButton value="lattice" disabled={!hasCell}>
              Lattice (frac)
            </ToggleButton>
          </span>
        </Tooltip>
      </ToggleButtonGroup>

      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField
          type="number"
          size="small"
          label="dx"
          value={dx}
          onChange={(e) => setDx(e.target.value)}
        />
        <TextField
          type="number"
          size="small"
          label="dy"
          value={dy}
          onChange={(e) => setDy(e.target.value)}
        />
        <TextField
          type="number"
          size="small"
          label="dz"
          value={dz}
          onChange={(e) => setDz(e.target.value)}
        />
      </Stack>

      <Tooltip title="Re-wrap atoms outside the cell back inside (periodic boundary)">
        <span>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={wrap && hasCell}
                disabled={!hasCell}
                onChange={(e) => setWrap(e.target.checked)}
              />
            }
            label="Wrap into cell"
          />
        </span>
      </Tooltip>

      <Box sx={{ mt: 1 }}>
        <Button
          variant="contained"
          size="small"
          disabled={!hasStructure || busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => void handleApplyTranslate()}
        >
          Apply
        </Button>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" gutterBottom>
        Supercell
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Repeat the unit cell nx×ny×nz to build a larger cell.
      </Typography>
      {!hasCell && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Requires a unit cell.
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField
          type="number"
          size="small"
          label="nx"
          value={nx}
          onChange={(e) => setNx(e.target.value)}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          disabled={!hasCell}
        />
        <TextField
          type="number"
          size="small"
          label="ny"
          value={ny}
          onChange={(e) => setNy(e.target.value)}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          disabled={!hasCell}
        />
        <TextField
          type="number"
          size="small"
          label="nz"
          value={nz}
          onChange={(e) => setNz(e.target.value)}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          disabled={!hasCell}
        />
      </Stack>
      <Button
        variant="contained"
        size="small"
        disabled={!hasStructure || !hasCell || busy}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        onClick={() => void handleBuildSupercell()}
      >
        Build
      </Button>
    </Box>
  );
}

export default TransformPanel;
