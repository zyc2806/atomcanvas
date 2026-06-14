import { useCallback, useEffect, useState } from 'react';
import ViewerCanvas from './components/r3f/ViewerCanvas';
import { TopBar } from './components/shell/TopBar';
import { PanelHost } from './components/shell/PanelHost';
import type { ActivePanel } from './components/shell/PanelHost';
import { Toaster } from './components/shell/Toaster';
import { useStructureStore } from './store/useStructureStore';
import { structureService } from './services/structureService';
import { useLoadAtomStyles } from './hooks/useLoadAtomStyles';

const PANEL_KEYS: Record<string, Exclude<ActivePanel, null>> = {
  s: 'style',
  b: 'bonds',
  c: 'scene',
  a: 'selection',
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export default function App() {
  useLoadAtomStyles();
  const addTab = useStructureStore((s) => s.addTab);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const doc = await structureService.uploadStructure(file);
      addTab(doc, file.name.replace(/\.[^.]+$/, ''));
    }
  }, [addTab]);

  const togglePanel = useCallback((panel: Exclude<ActivePanel, null>) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key === 'Escape') {
        setActivePanel(null);
        return;
      }
      const panel = PANEL_KEYS[e.key.toLowerCase()];
      if (panel) {
        e.preventDefault();
        togglePanel(panel);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePanel]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <ViewerCanvas />
      <TopBar
        activePanel={activePanel}
        onTogglePanel={togglePanel}
        onOpenFiles={onFiles}
      />
      <PanelHost activePanel={activePanel} onClose={() => setActivePanel(null)} />
      <Toaster />
    </div>
  );
}
