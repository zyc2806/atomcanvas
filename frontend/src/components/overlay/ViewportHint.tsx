import { useState } from 'react';
import { IconButton, Paper, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useStructureStore } from '../../store/useStructureStore';
import { shouldShowViewportHint, dismissViewportHint } from '../../utils/onboarding';

/**
 * A dismissible onboarding caption that teaches the app's gateway interaction —
 * clicking an atom selects it. It appears once a structure is loaded (when the
 * EmptyState onboarding overlay has unmounted, leaving the canvas with no hints)
 * and stays until the user dismisses it, persisting that choice in localStorage
 * so it never returns. This is the one surface that delivers the click-to-select
 * knowledge while the canvas is interactive.
 */
export function ViewportHint() {
  const structureData = useStructureStore((s) => s.structureData);
  // Read the persisted "seen" flag once on mount; dismiss flips it locally so the
  // caption hides immediately without a store round-trip.
  const [dismissed, setDismissed] = useState(() => !shouldShowViewportHint());

  if (!structureData || dismissed) return null;

  return (
    <Paper
      elevation={3}
      data-testid="viewport-hint"
      sx={{
        position: 'absolute',
        top: 72,
        left: '50%',
        transform: 'translateX(-50%)',
        // Above the canvas and the SelectionActionBar, below the AppBar.
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        pl: 1.5,
        pr: 0.5,
        py: 0.25,
        borderRadius: 5,
      }}
    >
      <Typography variant="body2">Click an atom to select · drag to rotate</Typography>
      <IconButton
        size="small"
        aria-label="Dismiss hint"
        onClick={() => {
          dismissViewportHint();
          setDismissed(true);
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Paper>
  );
}

export default ViewportHint;
