import { useRef, useState } from 'react';
import { Box, Popover } from '@mui/material';
import { HexColorPicker } from 'react-colorful';

/**
 * Small color-swatch button that opens a react-colorful picker in a Popover.
 *
 * Shared by the StylePanel sidebar and the in-viewport SelectionActionBar so the
 * floating recolour control offers the same full picker as the sidebar (rather
 * than a fixed list of preset swatches).
 */
export function ColorSwatch({
  color,
  onChange,
  size = 24,
  testId,
  onPickStart,
}: {
  color: string;
  onChange: (color: string) => void;
  size?: number;
  testId?: string;
  // Fired once, on the first color change of a pick session — lets the consumer
  // snapshot undo history once per gesture instead of on every pointer-move.
  onPickStart?: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const pickStartedRef = useRef(false);
  return (
    <>
      <Box
        component="button"
        type="button"
        aria-label="pick color"
        data-testid={testId}
        onClick={(e) => {
          pickStartedRef.current = false;
          setAnchorEl(e.currentTarget);
        }}
        // The dynamic fill lives in an inline style (not sx) so it is the
        // element's own backgroundColor — readable in tests and overriding the
        // emotion class deterministically.
        style={{ backgroundColor: color }}
        sx={{
          width: size,
          height: size,
          borderRadius: 1,
          border: '1px solid rgba(255,255,255,0.3)',
          cursor: 'pointer',
          p: 0,
        }}
      />
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => {
          pickStartedRef.current = false;
          setAnchorEl(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1.5 }}>
          <HexColorPicker
            color={color}
            onChange={(c) => {
              if (!pickStartedRef.current) {
                pickStartedRef.current = true;
                onPickStart?.();
              }
              onChange(c);
            }}
          />
        </Box>
      </Popover>
    </>
  );
}

export default ColorSwatch;
