import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';

export type OpMode = 'replace' | 'add' | 'filter' | 'exclude';

// `value` is the internal id consumed by combineExpressions/the store and MUST
// stay stable. `label` is the user-visible button text; `tooltip` is plain-English
// help so the set-logic terminology isn't a barrier to new users.
const MODES: { value: OpMode; label: string; tooltip: string }[] = [
  { value: 'replace', label: 'Replace', tooltip: 'Start a new selection (replace current)' },
  { value: 'add', label: 'Add', tooltip: 'Add to current selection (union)' },
  { value: 'filter', label: 'Intersect', tooltip: 'Keep only atoms also in the current selection (intersect)' },
  { value: 'exclude', label: 'Exclude', tooltip: 'Remove these from the current selection' },
];

interface Props {
  value: OpMode;
  onChange: (mode: OpMode) => void;
}

export function OperationModeSelector({ value, onChange }: Props) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      fullWidth
      value={value}
      onChange={(_, v) => { if (v) onChange(v as OpMode); }}
      aria-label="selection operation mode"
      sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 0.75, py: 0.5, fontSize: '0.72rem', minWidth: 0 } }}
    >
      {MODES.map((m) => (
        <Tooltip key={m.value} title={m.tooltip}>
          <ToggleButton value={m.value}>{m.label}</ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}

export default OperationModeSelector;
