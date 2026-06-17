// Pure resolution of the app's global keyboard shortcuts, split out from App so
// the logic is unit-testable. The caller is responsible for the side effects
// (calling undo/redo, toggling panels) and for any preventDefault.

export type PanelKey = 'style' | 'bonds' | 'scene' | 'selection';

export type ShortcutAction =
  | { type: 'none' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'closePanel' }
  | { type: 'togglePanel'; panel: PanelKey };

export interface KeyEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const PANEL_KEYS: Record<string, PanelKey> = {
  s: 'style',
  b: 'bonds',
  c: 'scene',
  a: 'selection',
};

export function resolveShortcut(
  e: KeyEventLike,
  opts: { editableTarget: boolean },
): ShortcutAction {
  const mod = Boolean(e.metaKey || e.ctrlKey);

  // Undo / redo: Cmd/Ctrl+Z (Shift = redo) and Ctrl+Y. These are the only
  // modifier combos we claim — but never while a text field is focused, so the
  // browser's native undo keeps working there.
  if (mod && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 'z') {
      if (opts.editableTarget) return { type: 'none' };
      return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    }
    if (key === 'y') {
      if (opts.editableTarget) return { type: 'none' };
      return { type: 'redo' };
    }
  }

  // Every other modifier combo is left to the browser.
  if (e.metaKey || e.ctrlKey || e.altKey) return { type: 'none' };

  // Plain keys only act when not typing into a field.
  if (opts.editableTarget) return { type: 'none' };

  if (e.key === 'Escape') return { type: 'closePanel' };

  const panel = PANEL_KEYS[e.key.toLowerCase()];
  if (panel) return { type: 'togglePanel', panel };

  return { type: 'none' };
}
