import { ToggleButton, ToggleButtonGroup } from '@mui/material';

export type OpMode = 'replace' | 'add' | 'filter' | 'exclude';

const MODES: { value: OpMode; label: string }[] = [
  { value: 'replace', label: 'Replace' },
  { value: 'add', label: 'Add' },
  { value: 'filter', label: 'Filter' },
  { value: 'exclude', label: 'Exclude' },
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
    >
      {MODES.map((m) => (
        <ToggleButton key={m.value} value={m.value}>{m.label}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default OperationModeSelector;
