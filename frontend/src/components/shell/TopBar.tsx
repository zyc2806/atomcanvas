import { useRef } from 'react';
import { AppBar, Toolbar, Button, Box, IconButton, Tooltip, Typography } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import LinkIcon from '@mui/icons-material/Link';
import TuneIcon from '@mui/icons-material/Tune';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import { StructureTabs } from './StructureTabs';
import { ExportMenu } from './ExportMenu';
import { useStructureStore } from '../../store/useStructureStore';
import type { ActivePanel } from './PanelHost';

interface TopBarProps {
  activePanel: ActivePanel;
  onTogglePanel: (panel: Exclude<ActivePanel, null>) => void;
  onOpenFiles: (files: FileList | null) => void;
}

export function TopBar({ activePanel, onTogglePanel, onOpenFiles }: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const undo = useStructureStore((s) => s.undo);
  const redo = useStructureStore((s) => s.redo);
  const canUndo = useStructureStore((s) => s.past.length > 0);
  const canRedo = useStructureStore((s) => s.future.length > 0);

  return (
    <AppBar position="fixed" color="default" elevation={1} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Typography
          variant="subtitle1"
          component="div"
          sx={{ fontWeight: 700, mr: 1, userSelect: 'none' }}
        >
          AtomCanvas
        </Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={() => fileRef.current?.click()}
        >
          Open
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          data-testid="file-input"
          onChange={(e) => onOpenFiles(e.target.files)}
        />

        <Tooltip title="Undo (⌘Z)">
          <span>
            <IconButton
              size="small"
              aria-label="undo"
              disabled={!canUndo}
              onClick={() => undo()}
            >
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (⌘⇧Z)">
          <span>
            <IconButton
              size="small"
              aria-label="redo"
              disabled={!canRedo}
              onClick={() => redo()}
            >
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <StructureTabs />

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title="Style (s)">
          <Button
            size="small"
            startIcon={<PaletteIcon fontSize="small" />}
            color={activePanel === 'style' ? 'primary' : 'inherit'}
            onClick={() => onTogglePanel('style')}
            aria-label="toggle style panel"
          >
            Style
          </Button>
        </Tooltip>
        <Tooltip title="Bonds (b)">
          <Button
            size="small"
            startIcon={<LinkIcon fontSize="small" />}
            color={activePanel === 'bonds' ? 'primary' : 'inherit'}
            onClick={() => onTogglePanel('bonds')}
            aria-label="toggle bonds panel"
          >
            Bonds
          </Button>
        </Tooltip>
        <Tooltip title="Scene (c)">
          <Button
            size="small"
            startIcon={<TuneIcon fontSize="small" />}
            color={activePanel === 'scene' ? 'primary' : 'inherit'}
            onClick={() => onTogglePanel('scene')}
            aria-label="toggle scene panel"
          >
            Scene
          </Button>
        </Tooltip>
        <Tooltip title="Selection (a)">
          <Button
            size="small"
            startIcon={<HighlightAltIcon fontSize="small" />}
            color={activePanel === 'selection' ? 'primary' : 'inherit'}
            onClick={() => onTogglePanel('selection')}
            aria-label="toggle selection panel"
          >
            Select
          </Button>
        </Tooltip>

        <ExportMenu />
      </Toolbar>
    </AppBar>
  );
}

export default TopBar;
