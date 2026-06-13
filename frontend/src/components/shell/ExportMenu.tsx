import { useRef, useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  Divider,
  ListItemText,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem as SelectItem,
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

const STRUCTURE_FORMATS = [
  { value: 'cif', label: 'CIF (.cif)' },
  { value: 'vasp', label: 'POSCAR (VASP)' },
  { value: 'xyz', label: 'XYZ (.xyz)' },
  { value: 'extxyz', label: 'Extended XYZ (.extxyz)' },
  { value: 'pdb', label: 'PDB (.pdb)' },
];

interface ToastState {
  severity: 'success' | 'error';
  message: string;
}

export function ExportMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const [format, setFormat] = useState('cif');
  const importRef = useRef<HTMLInputElement>(null);

  const hasStructure = useStructureStore((s) => s.structureData !== null);
  const tabCount = useStructureStore((s) => s.tabs.length);

  const open = Boolean(anchorEl);
  const close = () => setAnchorEl(null);

  const run = (fn: () => void | Promise<void>, label: string) => async () => {
    close();
    try {
      await fn();
    } catch (err) {
      setToast({ severity: 'error', message: `${label} failed: ${(err as Error).message}` });
    }
  };

  const onExportStructure = run(() => {
    setFormatDialogOpen(true);
  }, 'Structure export');

  const doStructureExport = async () => {
    setFormatDialogOpen(false);
    const s = useStructureStore.getState();
    if (!s.structureData) return;
    try {
      const payload = buildExportPayload({
        structureData: s.structureData,
        scope: 'current_frame',
        format,
        structureVersion: 1,
      });
      const result = await structureService.exportStructure(payload);
      const tabName = s.tabs.find((t) => t.id === s.activeTabId)?.name ?? 'structure';
      const filename = result.filename ?? uniqueName(tabName, format);
      downloadBlob(result.blob, filename, 'application/octet-stream');
      if (result.warnings.length > 0) {
        setToast({ severity: 'success', message: result.warnings.map((w) => w.message).join('; ') });
      }
    } catch (err) {
      setToast({ severity: 'error', message: `Structure export failed: ${(err as Error).message}` });
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
        setToast({ severity: 'success', message: 'Scene imported' });
      } else {
        applyStylePreset(parsed);
        setToast({ severity: 'success', message: 'Style preset imported' });
      }
    } catch (err) {
      setToast({ severity: 'error', message: `Import failed: ${(err as Error).message}` });
    }
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<FileDownloadIcon />}
        aria-label="Export"
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        Export
      </Button>

      <Menu anchorEl={anchorEl} open={open} onClose={close}>
        <MenuItem disabled={!hasStructure} onClick={run(exportCurrentPng, 'PNG export')}>
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

        <MenuItem disabled={tabCount === 0} onClick={run(batchExportPng, 'Batch PNG export')}>
          <ListItemText>Batch: all tabs → PNG</ListItemText>
        </MenuItem>
        <MenuItem disabled={tabCount === 0} onClick={run(batchExportGlb, 'Batch glb export')}>
          <ListItemText>Batch: all tabs → glb</ListItemText>
        </MenuItem>
        <MenuItem disabled={!hasStructure} onClick={onExportStructure}>
          <ListItemText>Structure file (CIF/POSCAR/XYZ)…</ListItemText>
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
              value={format}
              onChange={(e: SelectChangeEvent) => setFormat(e.target.value)}
            >
              {STRUCTURE_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormatDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={doStructureExport}>
            Export
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}

export default ExportMenu;
