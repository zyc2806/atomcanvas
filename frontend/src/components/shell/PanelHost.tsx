import { lazy, Suspense } from 'react';
import { Drawer } from '@mui/material';

const StylePanel = lazy(() => import('../panels/StylePanel'));
const BondEditPanel = lazy(() => import('../panels/BondEditPanel'));
const ScenePanel = lazy(() => import('../panels/ScenePanel'));
const TransformPanel = lazy(() => import('../panels/TransformPanel'));
const SelectionPanel = lazy(() => import('../panels/selection/SelectionPanel'));

export type ActivePanel = 'style' | 'bonds' | 'scene' | 'selection' | 'transform' | null;

interface PanelHostProps {
  activePanel: ActivePanel;
  onClose: () => void;
}

export function PanelHost({ activePanel, onClose }: PanelHostProps) {
  return (
    <Drawer anchor="right" variant="persistent" open={!!activePanel} onClose={onClose}>
      <Suspense fallback={null}>
        {activePanel === 'style' && <StylePanel />}
        {activePanel === 'bonds' && <BondEditPanel />}
        {activePanel === 'scene' && <ScenePanel />}
        {activePanel === 'transform' && <TransformPanel />}
        {activePanel === 'selection' && <SelectionPanel />}
      </Suspense>
    </Drawer>
  );
}

export default PanelHost;
