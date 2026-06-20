import { useState } from 'react';
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material';
import { useStructureStore } from '../../store/useStructureStore';
import type { StructureState, StructureTab } from '../../types/store';

const nonEmpty = (m: Record<string, unknown> | null | undefined): boolean => !!m && Object.keys(m).length > 0;

// Whether the tab being closed has unsaved styling/bond edits. The active tab's
// edits live in the live store maps; a background tab's edits live in its own
// StructureTab snapshot. (The `elements` per-element map is intentionally NOT
// consulted — it is absent from the snapshot by a separate known bug.)
function tabHasEdits(s: StructureState, tab: StructureTab): boolean {
  const isActive = tab.id === s.activeTabId;
  if (isActive) {
    return (
      nonEmpty(s.topologyOverrides) ||
      nonEmpty(s.colorOverrides) ||
      nonEmpty(s.opacityOverrides) ||
      nonEmpty(s.radiusOverrides) ||
      nonEmpty(s.perAtomColorOverrides) ||
      nonEmpty(s.perAtomOpacityOverrides)
    );
  }
  return (
    nonEmpty(tab.bondTopologyOverrides) ||
    nonEmpty(tab.colorOverrides) ||
    nonEmpty(tab.opacityOverrides) ||
    nonEmpty(tab.radiusOverrides) ||
    nonEmpty(tab.perAtomColorOverrides) ||
    nonEmpty(tab.perAtomOpacityOverrides)
  );
}

export function StructureTabs() {
  const tabs = useStructureStore((s) => s.tabs);
  const activeTabId = useStructureStore((s) => s.activeTabId);
  const switchTab = useStructureStore((s) => s.switchTab);
  const closeTab = useStructureStore((s) => s.closeTab);
  // Tab pending close-confirmation, or null when no dialog is open.
  const [pendingClose, setPendingClose] = useState<StructureTab | null>(null);

  if (tabs.length === 0) return null;

  const requestClose = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    // A pristine tab closes in one click; only edited tabs trigger the gate.
    if (tabHasEdits(useStructureStore.getState(), tab)) setPendingClose(tab);
    else closeTab(id);
  };

  const confirmClose = () => {
    if (pendingClose) closeTab(pendingClose.id);
    setPendingClose(null);
  };

  return (
    <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', maxWidth: '50vw' }}>
      {tabs.map((t) => (
        <Chip
          key={t.id}
          label={t.name}
          size="small"
          color={t.id === activeTabId ? 'primary' : 'default'}
          onClick={() => switchTab(t.id)}
          onDelete={() => requestClose(t.id)}
        />
      ))}
      <Dialog open={pendingClose !== null} onClose={() => setPendingClose(null)} maxWidth="xs">
        <DialogTitle>Close &quot;{pendingClose?.name}&quot;?</DialogTitle>
        <DialogContent>
          <DialogContentText>Unsaved styling and bond edits will be lost.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingClose(null)}>Cancel</Button>
          <Button onClick={confirmClose} color="error">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default StructureTabs;
