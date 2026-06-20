import { useRef, useState, useMemo } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  Divider,
  ListItemText,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormLabel,
  InputLabel,
  Select,
  MenuItem as SelectItem,
  Radio,
  RadioGroup,
  FormControlLabel,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useStructureStore } from '../../store/useStructureStore';
import {
  exportCurrentPng,
  exportCurrentGlb,
  exportSceneJson,
  exportStyleJson,
  batchExportPng,
  batchExportGlb,
} from '../../services/batchExport';
import { downloadBlob, uniqueName } from '../../services/download';
import { parseDocument, applySceneDocument, applyStylePreset } from '../../services/sceneDocument';
import { structureService, buildExportPayload } from '../../services/structureService';
import type { ExportScope } from '../../services/structureService';

const STRUCTURE_FORMATS = [
  { value: 'xyz', label: 'XYZ (.xyz)', supportsMultipleFrames: false },
  { value: 'extxyz', label: 'Extended XYZ (.extxyz)', supportsMultipleFrames: true },
  { value: 'cif', label: 'CIF (.cif)', supportsMultipleFrames: true },
  { value: 'vasp', label: 'POSCAR (VASP)', supportsMultipleFrames: false },
  { value: 'vasp-xdatcar', label: 'XDATCAR (VASP)', supportsMultipleFrames: true },
  { value: 'traj', label: 'ASE Trajectory (.traj)', supportsMultipleFrames: true },
  { value: 'json', label: 'ASE JSON (.json)', supportsMultipleFrames: true },
  { value: 'pdb', label: 'PDB (.pdb)', supportsMultipleFrames: false },
  { value: 'cube', label: 'Gaussian Cube (.cube)', supportsMultipleFrames: false },
];

export function ExportMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const [format, setFormat] = useState('extxyz');
  const [scope, setScope] = useState<ExportScope>('current_frame');
  const importRef = useRef<HTMLInputElement>(null);

  const hasStructure = useStructureStore((s) => s.structureData !== null);
  const hasTrajectory = useStructureStore((s) => (s.structureData?.trajectory?.length ?? 0) > 1);
  const tabCount = useStructureStore((s) => s.tabs.length);
  const exportScale = useStructureStore((s) => s.exportScale);
  const setExportScale = useStructureStore((s) => s.setExportScale);
  const exporting = useStructureStore((s) => s.exporting);
  const setExporting = useStructureStore((s) => s.setExporting);
  const notify = useStructureStore((s) => s.notify);

  const availableFormats = useMemo(
    () =>
      scope === 'full_trajectory'
        ? STRUCTURE_FORMATS.filter((f) => f.supportsMultipleFrames)
        : STRUCTURE_FORMATS,
    [scope],
  );

  const selectedFormat = useMemo(
    () =>
      availableFormats.some((f) => f.value === format)
        ? format
        : (availableFormats[0]?.value ?? 'xyz'),
    [availableFormats, format],
  );

  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);

  const run = (fn: () => void | Promise<void>, label: string) => async () => {
    close();
    setExporting(true);
    try {
      await fn();
    } catch (err) {
      notify(`${label} failed: ${(err as Error).message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const onExportStructure = run(() => {
    setScope('current_frame');
    setFormatDialogOpen(true);
  }, 'Structure export');

  const doStructureExport = async () => {
    setFormatDialogOpen(false);
    const s = useStructureStore.getState();
    if (!s.structureData) return;
    setExporting(true);
    try {
      const payload = buildExportPayload({
        structureData: s.structureData,
        scope,
        format: selectedFormat,
        structureVersion: 1,
      });
      const result = await structureService.exportStructure(payload);
      const tabName = s.tabs.find((t) => t.id === s.activeTabId)?.name ?? 'structure';
      const filename = result.filename ?? uniqueName(tabName, selectedFormat);
      downloadBlob(result.blob, filename, 'application/octet-stream');
      if (result.warnings.length > 0) {
        notify(result.warnings.map((w) => w.message).join('; '), 'success');
      }
    } catch (err) {
      notify(`Structure export failed: ${(err as Error).message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  const onImportClick = () => {
    close();
    importRef.current?.click();
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseDocument(text);
      if (parsed.kind === 'atomcanvas-scene') {
        applySceneDocument(parsed);
        notify('Scene imported', 'success');
      } else {
        applyStylePreset(parsed);
        notify('Style preset imported', 'success');
      }
    } catch (err) {
      notify(`Import failed: ${(err as Error).message}`, 'error');
    }
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<FileDownloadIcon />}
        aria-label="Export"
        disabled={exporting}
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        Export
      </Button>

      <Menu anchorEl={anchorEl} open={open} onClose={close}>
        <Box
          sx={{ px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}
          // Keep clicks/keys/mousedown inside the resolution control from closing
          // the menu or being treated as menu navigation. onMouseDown is needed
          // because MUI Menu's ClickAwayListener fires on mousedown — without it
          // the Select portal can close the menu before the selection commits.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Typography variant="body2" sx={{ flexShrink: 0 }} id="png-resolution-label">
            PNG resolution
          </Typography>
          <FormControl size="small" sx={{ minWidth: 88 }}>
            <Select
              aria-labelledby="png-resolution-label"
              inputProps={{ 'aria-label': 'PNG resolution' }}
              value={String(exportScale)}
              onChange={(e: SelectChangeEvent) => setExportScale(Number(e.target.value))}
            >
              <SelectItem value="1">1×</SelectItem>
              <SelectItem value="2">2×</SelectItem>
              <SelectItem value="4">4×</SelectItem>
            </Select>
          </FormControl>
        </Box>

        <Divider />

        <MenuItem disabled={!hasStructure} onClick={run(() => exportCurrentPng(exportScale), 'PNG export')}>
          <ListItemText>PNG (current)</ListItemText>
        </MenuItem>
        <MenuItem disabled={!hasStructure} onClick={run(exportCurrentGlb, 'glb export')}>
          <ListItemText>glb (current)</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(exportStyleJson, 'style.json export')}>
          <ListItemText>style.json</ListItemText>
        </MenuItem>
        <MenuItem disabled={!hasStructure} onClick={run(exportSceneJson, 'scene.json export')}>
          <ListItemText>scene.json</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem disabled={tabCount === 0} onClick={run(() => batchExportPng(exportScale), 'Batch PNG export')}>
          <ListItemText>Batch: all tabs → PNG</ListItemText>
        </MenuItem>
        <MenuItem disabled={tabCount === 0} onClick={run(batchExportGlb, 'Batch glb export')}>
          <ListItemText>Batch: all tabs → glb</ListItemText>
        </MenuItem>
        <MenuItem disabled={!hasStructure} onClick={onExportStructure}>
          <ListItemText>Structure file…</ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={onImportClick}>
          <ListItemText>Open scene.json / style.json…</ListItemText>
        </MenuItem>
      </Menu>

      <input
        ref={importRef}
        type="file"
        accept=".json"
        hidden
        data-testid="import-doc-input"
        onChange={onImportFile}
      />

      <Dialog open={formatDialogOpen} onClose={() => setFormatDialogOpen(false)}>
        <DialogTitle>Export structure file</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1, minWidth: 240 }}>
            <InputLabel id="export-format-label">Format</InputLabel>
            <Select
              labelId="export-format-label"
              label="Format"
              value={selectedFormat}
              onChange={(e: SelectChangeEvent) => setFormat(e.target.value)}
            >
              {availableFormats.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>

          <FormControl component="fieldset" sx={{ mt: 2 }}>
            <FormLabel component="legend" id="export-scope-label">Scope</FormLabel>
            <RadioGroup
              aria-labelledby="export-scope-label"
              value={scope}
              onChange={(e) => setScope(e.target.value as ExportScope)}
            >
              <FormControlLabel
                value="current_frame"
                control={<Radio />}
                label="Current frame"
              />
              <FormControlLabel
                value="full_trajectory"
                control={<Radio />}
                label="Full trajectory"
                disabled={!hasTrajectory}
              />
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormatDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={doStructureExport}>
            Export
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ExportMenu;
