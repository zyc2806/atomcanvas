import { useRef, type DragEvent } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useStructureStore } from '../../store/useStructureStore';

interface EmptyStateProps {
  onOpenFiles: (files: FileList | null) => void;
  onLoadSample: () => void;
}

/**
 * Onboarding overlay shown when no structure is loaded (the landing view would
 * otherwise be an empty black canvas). Presentational: the parent injects the
 * file-load and sample-load callbacks. Visibility keys off structureData, which
 * closeTab now clears when the last tab is removed.
 */
export function EmptyState({ onOpenFiles, onLoadSample }: EmptyStateProps) {
  const structureData = useStructureStore((s) => s.structureData);
  const fileRef = useRef<HTMLInputElement>(null);

  if (structureData) return null;

  return (
    <Box
      data-testid="empty-state-dropzone"
      onDragOver={(e: DragEvent<HTMLDivElement>) => e.preventDefault()}
      onDrop={(e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        onOpenFiles(e.dataTransfer.files);
      }}
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Above the canvas, below the AppBar (theme.zIndex.drawer + 1) so the
        // toolbar stays clickable.
        zIndex: 1,
      }}
    >
      <Stack
        spacing={2}
        alignItems="center"
        sx={{ color: 'text.secondary', textAlign: 'center', px: 2 }}
      >
        <UploadFileIcon sx={{ fontSize: 64, opacity: 0.5 }} />
        <Typography variant="h6">Open a structure file</Typography>
        <Typography variant="body2">Drag &amp; drop a file here, or</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => fileRef.current?.click()}>
            Open file
          </Button>
          <Button variant="outlined" onClick={() => onLoadSample()}>
            Load a sample
          </Button>
        </Stack>
        <Typography variant="caption">
          Supports .xyz, .cif, POSCAR, .pdb and more
        </Typography>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          data-testid="empty-state-file-input"
          onChange={(e) => onOpenFiles(e.target.files)}
        />
      </Stack>
    </Box>
  );
}

export default EmptyState;
