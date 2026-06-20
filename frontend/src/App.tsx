import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import ViewerCanvas from './components/r3f/ViewerCanvas';
import { TopBar } from './components/shell/TopBar';
import { PanelHost } from './components/shell/PanelHost';
import type { ActivePanel } from './components/shell/PanelHost';
import { Toaster } from './components/shell/Toaster';

const ShortcutsDialog = lazy(() => import('./components/shell/ShortcutsDialog'));
import { SelectionActionBar } from './components/overlay/SelectionActionBar';
import { TrajectoryBar } from './components/overlay/TrajectoryBar';
import { EmptyState } from './components/overlay/EmptyState';
import { ViewportHint } from './components/overlay/ViewportHint';
import { shouldFireLoadToast, markLoadToastFired } from './utils/onboarding';
import { useStructureStore } from './store/useStructureStore';
import { structureService } from './services/structureService';
import { useLoadAtomStyles } from './hooks/useLoadAtomStyles';
import { resolveShortcut } from './utils/keyboardShortcuts';
import { restoreSession, subscribeSessionPersistence } from './services/sessionPersistence';

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

  // Restore persisted session on mount; subscribe to auto-save on changes.
  useEffect(() => {
    restoreSession();
    const unsub = subscribeSessionPersistence();
    return unsub;
  }, []);

  const addTab = useStructureStore((s) => s.addTab);
  const notify = useStructureStore((s) => s.notify);
  const setLoading = useStructureStore((s) => s.setLoading);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    try {
      const doc = await structureService.uploadStructure(file);
      addTab(doc, file.name.replace(/\.[^.]+$/, ''));
      // One-time nudge toward the gateway interaction, on the user's very first
      // successful load only (the persistent viewport caption carries it after).
      if (shouldFireLoadToast()) {
        markLoadToastFired();
        notify('Loaded — click atoms to select. Press ? for shortcuts.', 'success');
      }
    } catch {
      notify(`Failed to load ${file.name}`, 'error');
    }
  }, [addTab, notify]);

  const loadFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setLoading(true);
    try {
      for (const file of Array.from(files)) {
        await loadFile(file);
      }
    } finally {
      setLoading(false);
    }
  }, [loadFile, setLoading]);

  // Fetch the bundled sample (served from public/samples) and load it as if the
  // user had opened the file themselves.
  const loadSample = useCallback(async () => {
    try {
      const res = await fetch('/samples/water.xyz');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      await loadFile(new File([blob], 'water.xyz', { type: 'chemical/x-xyz' }));
    } catch {
      notify('Failed to load the sample structure', 'error');
    }
  }, [loadFile, notify]);

  const loadTrajectorySample = useCallback(async () => {
    try {
      const res = await fetch('/samples/water_traj.extxyz');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      await loadFile(new File([blob], 'water_traj.extxyz', { type: 'chemical/x-xyz' }));
    } catch {
      notify('Failed to load the trajectory sample', 'error');
    }
  }, [loadFile, notify]);

  const togglePanel = useCallback((panel: Exclude<ActivePanel, null>) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = resolveShortcut(e, {
        editableTarget: isEditableTarget(e.target),
      });
      switch (action.type) {
        case 'undo': {
          const { undo, past } = useStructureStore.getState();
          // Only swallow the key when we actually consume it.
          if (past.length > 0) {
            e.preventDefault();
            undo();
          }
          break;
        }
        case 'redo': {
          const { redo, future } = useStructureStore.getState();
          if (future.length > 0) {
            e.preventDefault();
            redo();
          }
          break;
        }
        case 'playbackToggle': {
          const s = useStructureStore.getState();
          if ((s.structureData?.trajectory?.length ?? 0) > 1) {
            e.preventDefault();
            s.togglePlay();
          }
          break;
        }
        case 'playbackStep': {
          const s = useStructureStore.getState();
          if ((s.structureData?.trajectory?.length ?? 0) > 1) {
            e.preventDefault();
            if (s.isPlaying) s.pause();
            s.stepFrame(action.delta);
          }
          break;
        }
        case 'closePanel':
          setActivePanel(null);
          break;
        case 'togglePanel':
          e.preventDefault();
          togglePanel(action.panel);
          break;
        case 'toggleHelp':
          e.preventDefault();
          setShortcutsOpen((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePanel]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <ViewerCanvas />
      <EmptyState onOpenFiles={loadFiles} onLoadSample={loadSample} onLoadTrajectorySample={loadTrajectorySample} />
      <ViewportHint />
      <SelectionActionBar />
      <TrajectoryBar />
      <TopBar
        activePanel={activePanel}
        onTogglePanel={togglePanel}
        onOpenFiles={loadFiles}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <PanelHost activePanel={activePanel} onClose={() => setActivePanel(null)} />
      <Toaster />
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <ShortcutsDialog open onClose={() => setShortcutsOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
