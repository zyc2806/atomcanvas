import { Snackbar, Alert } from '@mui/material';
import { useStructureStore } from '../../store/useStructureStore';

export function Toaster() {
  const notification = useStructureStore((s) => s.notification);
  const clearNotification = useStructureStore((s) => s.clearNotification);

  return (
    <Snackbar
      key={notification?.key}
      open={!!notification}
      autoHideDuration={2500}
      onClose={(_e, reason) => { if (reason !== 'clickaway') clearNotification(); }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      {notification ? (
        <Alert severity={notification.severity} variant="filled" onClose={clearNotification}>
          {notification.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  );
}

export default Toaster;
