import type { OpMode } from './OperationModeSelector';

// The per-method Apply button's label reflects the active operation mode, so the
// cause-effect ("this mode changes what Apply does") is visible at the moment of
// action — not just in the OperationModeSelector that sits separated at the top
// of the panel. `replace` keeps the plain "Apply" so the default reads naturally.
// Lives in its own module so the component files stay react-refresh compliant.
export function applyButtonLabel(mode: OpMode): string {
  switch (mode) {
    case 'add':
      return 'Add to selection';
    case 'filter':
      return 'Intersect';
    case 'exclude':
      return 'Exclude';
    default:
      return 'Apply';
  }
}
