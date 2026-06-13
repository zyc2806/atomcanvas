import { useCallback, useRef } from 'react';
import ViewerCanvas from './components/r3f/ViewerCanvas';
import { useStructureStore } from './store/useStructureStore';
import { structureService } from './services/structureService';
import { useLoadAtomStyles } from './hooks/useLoadAtomStyles';

export default function App() {
  useLoadAtomStyles();
  const fileRef = useRef<HTMLInputElement>(null);
  const addTab = useStructureStore((s) => s.addTab);

  const onFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const doc = await structureService.uploadStructure(file);
      addTab(doc, file.name.replace(/\.[^.]+$/, ''));
    }
  }, [addTab]);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <ViewerCanvas />
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        data-testid="file-input"
        onChange={(e) => onFiles(e.target.files)}
      />
      <button
        style={{ position: 'absolute', top: 8, left: 8 }}
        onClick={() => fileRef.current?.click()}
      >
        Open
      </button>
    </div>
  );
}
