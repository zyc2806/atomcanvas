// Pure resolution of the app's global keyboard shortcuts, split out from App so
// the logic is unit-testable. The caller is responsible for the side effects
// (calling undo/redo, toggling panels) and for any preventDefault.

export interface ShortcutDoc {
  keys: string;
  description: string;
  group: 'History' | 'Panels' | 'Playback' | 'General';
}

export const SHORTCUTS: ShortcutDoc[] = [
  // History
  { keys: '⌘Z / Ctrl+Z', description: 'Undo', group: 'History' },
  { keys: '⌘⇧Z / Ctrl+Shift+Z', description: 'Redo', group: 'History' },
  { keys: 'Ctrl+Y', description: 'Redo (Windows)', group: 'History' },
  // Panels
  { keys: 'S', description: 'Toggle Style panel', group: 'Panels' },
  { keys: 'B', description: 'Toggle Bonds panel', group: 'Panels' },
  { keys: 'C', description: 'Toggle Scene panel', group: 'Panels' },
  { keys: 'A', description: 'Toggle Selection panel', group: 'Panels' },
  { keys: 'T', description: 'Toggle Transform panel', group: 'Panels' },
  { keys: 'Esc', description: 'Close panel', group: 'General' },
  // Playback
  { keys: 'Space', description: 'Play / Pause', group: 'Playback' },
  { keys: '←', description: 'Previous frame', group: 'Playback' },
  { keys: '→', description: 'Next frame', group: 'Playback' },
  // General
  { keys: '?', description: 'Open keyboard shortcuts help', group: 'General' },
];

export type PanelKey = 'style' | 'bonds' | 'scene' | 'selection' | 'transform';

export type ShortcutAction =
  | { type: 'none' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'closePanel' }
  | { type: 'togglePanel'; panel: PanelKey }
  | { type: 'playbackToggle' }
  | { type: 'playbackStep'; delta: number }
  | { type: 'toggleHelp' };

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
  t: 'transform',
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

  // Trajectory playback transport. The handler no-ops these when there's no
  // multi-frame structure, so claiming them globally is harmless.
  if (e.key === ' ' || e.key === 'Spacebar') return { type: 'playbackToggle' };
  if (e.key === 'ArrowLeft') return { type: 'playbackStep', delta: -1 };
  if (e.key === 'ArrowRight') return { type: 'playbackStep', delta: 1 };

  const panel = PANEL_KEYS[e.key.toLowerCase()];
  if (panel) return { type: 'togglePanel', panel };

  if (e.key === '?') return { type: 'toggleHelp' };

  return { type: 'none' };
}
