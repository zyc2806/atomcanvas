import { Drawer } from '@mui/material';
import { StylePanel } from '../panels/StylePanel';
import { BondEditPanel } from '../panels/BondEditPanel';
import { ScenePanel } from '../panels/ScenePanel';
import SelectionPanel from '../panels/selection/SelectionPanel';

export type ActivePanel = 'style' | 'bonds' | 'scene' | 'selection' | null;

interface PanelHostProps {
  activePanel: ActivePanel;
  onClose: () => void;
}

export function PanelHost({ activePanel, onClose }: PanelHostProps) {
  return (
    <Drawer anchor="right" variant="persistent" open={!!activePanel} onClose={onClose}>
      {activePanel === 'style' && <StylePanel />}
      {activePanel === 'bonds' && <BondEditPanel />}
      {activePanel === 'scene' && <ScenePanel />}
      {activePanel === 'selection' && <SelectionPanel />}
    </Drawer>
  );
}

export default PanelHost;
