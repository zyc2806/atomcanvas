import { Chip, Stack } from '@mui/material';
import { useStructureStore } from '../../store/useStructureStore';

export function StructureTabs() {
  const tabs = useStructureStore((s) => s.tabs);
  const activeTabId = useStructureStore((s) => s.activeTabId);
  const switchTab = useStructureStore((s) => s.switchTab);
  const closeTab = useStructureStore((s) => s.closeTab);
  if (tabs.length === 0) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', maxWidth: '50vw' }}>
      {tabs.map((t) => (
        <Chip
          key={t.id}
          label={t.name}
          size="small"
          color={t.id === activeTabId ? 'primary' : 'default'}
          onClick={() => switchTab(t.id)}
          onDelete={() => closeTab(t.id)}
        />
      ))}
    </Stack>
  );
}

export default StructureTabs;
