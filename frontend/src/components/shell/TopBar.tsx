import { useRef } from 'react';
import { AppBar, Toolbar, Button, IconButton, Box, Tooltip } from '@mui/material';
import PaletteIcon from '@mui/icons-material/Palette';
import LinkIcon from '@mui/icons-material/Link';
import TuneIcon from '@mui/icons-material/Tune';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import { StructureTabs } from './StructureTabs';
import { ExportMenu } from './ExportMenu';
import type { ActivePanel } from './PanelHost';

interface TopBarProps {
  activePanel: ActivePanel;
  onTogglePanel: (panel: Exclude<ActivePanel, null>) => void;
  onOpenFiles: (files: FileList | null) => void;
}

export function TopBar({ activePanel, onTogglePanel, onOpenFiles }: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <AppBar position="fixed" color="default" elevation={1} sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
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

        <StructureTabs />

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title="Style (s)">
          <IconButton
            size="small"
            color={activePanel === 'style' ? 'primary' : 'default'}
            onClick={() => onTogglePanel('style')}
            aria-label="toggle style panel"
          >
            <PaletteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Bonds (b)">
          <IconButton
            size="small"
            color={activePanel === 'bonds' ? 'primary' : 'default'}
            onClick={() => onTogglePanel('bonds')}
            aria-label="toggle bonds panel"
          >
            <LinkIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Scene (c)">
          <IconButton
            size="small"
            color={activePanel === 'scene' ? 'primary' : 'default'}
            onClick={() => onTogglePanel('scene')}
            aria-label="toggle scene panel"
          >
            <TuneIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Selection (a)">
          <IconButton
            size="small"
            color={activePanel === 'selection' ? 'primary' : 'default'}
            onClick={() => onTogglePanel('selection')}
            aria-label="toggle selection panel"
          >
            <HighlightAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <ExportMenu />
      </Toolbar>
    </AppBar>
  );
}

export default TopBar;
