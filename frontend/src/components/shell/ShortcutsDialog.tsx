import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material';
import { SHORTCUTS } from '../../utils/keyboardShortcuts';
import type { ShortcutDoc } from '../../utils/keyboardShortcuts';

interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS: ShortcutDoc['group'][] = ['History', 'Panels', 'Playback', 'General'];

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Keyboard Shortcuts</DialogTitle>
      <DialogContent>
        {GROUPS.map((group) => {
          const rows = SHORTCUTS.filter((s) => s.group === group);
          if (rows.length === 0) return null;
          return (
            <div key={group}>
              <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5 }}>
                {group}
              </Typography>
              <Table size="small">
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.keys}>
                      <TableCell sx={{ py: 0.5 }}>
                        <code
                          style={{
                            background: 'rgba(128,128,128,0.15)',
                            borderRadius: 4,
                            padding: '1px 5px',
                            fontFamily: 'monospace',
                            fontSize: '0.8em',
                          }}
                        >
                          {row.keys}
                        </code>
                      </TableCell>
                      <TableCell sx={{ py: 0.5 }}>{row.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default ShortcutsDialog;
